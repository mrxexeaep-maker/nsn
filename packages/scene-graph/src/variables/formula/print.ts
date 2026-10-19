import type {
  VariableFormulaNode,
  VariableFormulaOperation,
  VariableFormulaOperator
} from '@open-pencil/scene-graph'
import { colorToHex8 } from '@open-pencil/scene-graph/color'

import {
  formulaArity,
  formulaSymbol,
  inferFormulaType,
  isFormulaCall,
  isFormulaOperation,
  MAX_FORMULA_DEPTH,
  type FormulaValueType
} from './evaluate'
import { FORMULA_NON_ASSOCIATIVE, FORMULA_PRECEDENCE, FORMULA_PREFIX_PRECEDENCE } from './parse'

const ATOM = FORMULA_PREFIX_PRECEDENCE + 1
/** Grouping these differently gives the same value, so `a + (b + c)` prints as `a + b + c`. */
const ASSOCIATIVE = new Set<VariableFormulaOperator>(['ADDITION', 'MULTIPLY', 'AND', 'OR'])
/** A long formula breaks before these: `or`, `and`, and `+` and `-`. */
const BREAKABLE = new Set([1, 2, 5])
const CONTINUATION = '\n  '

interface Printed {
  text: string
  precedence: number
}

export interface PrintFormulaOptions {
  /**
   * Past this many characters, a formula breaks before each operator of its outermost chain of
   * `or`, `and`, or `+` and `-`, with the lines after the first indented.
   */
  width?: number
  /**
   * How a reference reads where the formula is shown, such as a pill's name, which `width`
   * counts in place of the source spelling.
   */
  display?: (id: string) => string
  /**
   * A referenced variable's type. `+` adds numbers but joins text, so `a + (b + c)` drops its
   * parentheses only when both sides are known to be the same type.
   */
  type?: (id: string) => FormulaValueType | undefined
}

function nodePrecedence(node: VariableFormulaNode) {
  if (!isFormulaOperation(node) || isFormulaCall(node.operator)) return ATOM
  if (formulaArity(node.operator) === 1) return FORMULA_PREFIX_PRECEDENCE
  return FORMULA_PRECEDENCE[node.operator] ?? 0
}

type Operation = VariableFormulaOperation
type Print = (node: VariableFormulaNode, depth: number, breakAt?: number) => Printed
/** Whether two operations give one known type, so that regrouping them keeps the result. */
type SameType = (a: VariableFormulaNode, b: VariableFormulaNode) => boolean

const group = ({ text }: Printed) => `(${text})`

function printCall(node: Operation, depth: number, print: Print): Printed {
  const operands = node.operands.map((operand) => print(operand, depth + 1).text)
  return { text: `${formulaSymbol(node.operator)}(${operands.join(', ')})`, precedence: ATOM }
}

function printUnary(node: Operation, depth: number, print: Print): Printed {
  const [operandNode] = node.operands
  const operand = print(operandNode, depth + 1)
  const text = operand.precedence < ATOM ? group(operand) : operand.text
  const symbol = formulaSymbol(node.operator)
  return {
    text: node.operator === 'NOT' ? `${symbol} ${text}` : `${symbol}${text}`,
    precedence: FORMULA_PREFIX_PRECEDENCE
  }
}

/** `breakAt` is the precedence of the outermost chain while it is printed on several lines. */
function printBinary(
  node: Operation,
  depth: number,
  print: Print,
  sameType: SameType,
  breakAt?: number
): Printed {
  const precedence = FORMULA_PRECEDENCE[node.operator] ?? 0
  const chained = FORMULA_NON_ASSOCIATIVE.has(precedence)
  const [leftNode, rightNode] = node.operands
  const sameAssociative =
    ASSOCIATIVE.has(node.operator) &&
    isFormulaOperation(rightNode) &&
    rightNode.operator === node.operator &&
    (node.operator !== 'ADDITION' || sameType(node, rightNode))
  // The chain continues through a left operand and an unparenthesized right one of its level.
  const breaking = breakAt === precedence
  const left = print(leftNode, depth + 1, breaking ? breakAt : undefined)
  const right = print(rightNode, depth + 1, breaking && sameAssociative ? breakAt : undefined)
  // A comparison inside another, such as `(a > 1) == b`, keeps its parentheses to read clearly.
  const nested = (operand: Printed) => chained && FORMULA_NON_ASSOCIATIVE.has(operand.precedence)
  const leftText = left.precedence < precedence || nested(left) ? group(left) : left.text
  const rightGrouped =
    right.precedence < precedence ||
    nested(right) ||
    (right.precedence === precedence && !sameAssociative)
  const rightText = rightGrouped ? group(right) : right.text
  const separator = breaking ? CONTINUATION : ' '
  return { text: `${leftText}${separator}${formulaSymbol(node.operator)} ${rightText}`, precedence }
}

/** Print a formula with only the parentheses its precedence needs; `reference` spells a variable. */
export function printFormula(
  node: VariableFormulaNode,
  reference: (id: string) => string,
  { width, display, type }: PrintFormulaOptions = {}
): string {
  const typeOf = (of: VariableFormulaNode) => {
    try {
      return inferFormulaType(of, type)
    } catch {
      return undefined
    }
  }
  const sameType: SameType = (a, b) => {
    const left = typeOf(a)
    return left !== undefined && left === typeOf(b)
  }
  const line = printWith(reference, sameType, node)
  const outer = nodePrecedence(node)
  const shown = display ? printWith(display, sameType, node) : line
  if (width === undefined || shown.length <= width || !BREAKABLE.has(outer)) return line
  return printWith(reference, sameType, node, outer)
}

function printWith(
  reference: (id: string) => string,
  sameType: SameType,
  root: VariableFormulaNode,
  rootBreak?: number
): string {
  const print: Print = (node, depth, breakAt) => {
    if (depth > MAX_FORMULA_DEPTH) return { text: '…', precedence: ATOM }
    if (typeof node === 'number')
      return { text: String(node), precedence: node < 0 ? FORMULA_PREFIX_PRECEDENCE : ATOM }
    if (typeof node === 'boolean') return { text: String(node), precedence: ATOM }
    if (typeof node === 'string') return { text: JSON.stringify(node), precedence: ATOM }
    if (!isFormulaOperation(node))
      return {
        text: 'aliasId' in node ? reference(node.aliasId) : colorToHex8(node),
        precedence: ATOM
      }
    if (isFormulaCall(node.operator)) return printCall(node, depth, print)
    return formulaArity(node.operator) === 1
      ? printUnary(node, depth, print)
      : printBinary(node, depth, print, sameType, breakAt)
  }
  return print(root, 0, rootBreak).text
}
