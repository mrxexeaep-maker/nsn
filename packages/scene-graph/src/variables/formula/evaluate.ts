import type {
  Color,
  VariableFormulaNode,
  VariableFormulaOperation,
  VariableFormulaOperator,
  VariableLiteral,
  VariableType
} from '@open-pencil/scene-graph'

import { variableText } from '../text'

export const MAX_FORMULA_DEPTH = 64
export const MAX_FORMULA_LENGTH = 4096

export class VariableFormulaError extends Error {
  override name = 'VariableFormulaError'
}

export type FormulaValueType = VariableType

/** One set of operand types an operator takes, and the type it then gives. */
interface Overload {
  operands: readonly FormulaValueType[]
  result: FormulaValueType
}

/**
 * What each operator takes and gives, as Figma's expression signatures list them: `+` also joins
 * text with text, a number or a true/false value, `==` compares two values of one type, and
 * `if()` picks between two values of one type.
 */
interface OperatorSignature {
  /** How the operator is written, and the spelling the parser reads. */
  symbol: string
  /** Written as a function call, `symbol(operands)`, rather than around its operands. */
  call?: boolean
  arity: 1 | 2 | 3
  overloads: readonly Overload[]
  /** What the error says when no overload takes the operands. */
  needs: string
  /** Operands are checked against `overloads` before this runs. */
  apply: (operands: VariableLiteral[]) => VariableLiteral
}

const FLOAT_FLOAT = ['FLOAT', 'FLOAT'] as const
const TEXT_TYPES = ['FLOAT', 'BOOLEAN', 'STRING'] as const

const SIGNATURES: Record<VariableFormulaOperator, OperatorSignature> = {
  ADDITION: {
    symbol: '+',
    arity: 2,
    overloads: [
      { operands: FLOAT_FLOAT, result: 'FLOAT' },
      { operands: ['STRING', 'STRING'], result: 'STRING' },
      ...(['FLOAT', 'BOOLEAN'] as const).flatMap((other) => [
        { operands: ['STRING', other], result: 'STRING' } as const,
        { operands: [other, 'STRING'], result: 'STRING' } as const
      ])
    ],
    needs: 'adds numbers or joins text',
    apply: ([a, b]) =>
      typeof a === 'number' && typeof b === 'number'
        ? a + b
        : `${variableText(a) ?? ''}${variableText(b) ?? ''}`
  },
  SUBTRACTION: arithmetic('-', (a, b) => a - b),
  MULTIPLY: arithmetic('*', (a, b) => a * b),
  DIVIDE: arithmetic('/', (a, b) => {
    if (b === 0) throw new VariableFormulaError('Cannot divide by zero')
    return a / b
  }),
  NEGATE: {
    symbol: '-',
    arity: 1,
    overloads: [{ operands: ['FLOAT'], result: 'FLOAT' }],
    needs: 'needs numbers',
    apply: ([a]) => -Number(a)
  },
  EQUALS: equality('==', (a, b) => a === b),
  NOT_EQUAL: equality('!=', (a, b) => a !== b),
  LESS_THAN: comparison('<', (a, b) => a < b),
  LESS_THAN_OR_EQUAL: comparison('<=', (a, b) => a <= b),
  GREATER_THAN: comparison('>', (a, b) => a > b),
  GREATER_THAN_OR_EQUAL: comparison('>=', (a, b) => a >= b),
  AND: logic('and', (a, b) => a && b),
  OR: logic('or', (a, b) => a || b),
  NOT: {
    symbol: 'not',
    arity: 1,
    overloads: [{ operands: ['BOOLEAN'], result: 'BOOLEAN' }],
    needs: 'needs true or false',
    apply: ([a]) => a !== true
  },
  STRINGIFY: {
    symbol: 'text',
    call: true,
    arity: 1,
    overloads: TEXT_TYPES.map((type) => ({ operands: [type], result: 'STRING' })),
    needs: 'needs a number, text, or true or false',
    apply: ([a]) => variableText(a) ?? ''
  },
  IS_TRUTHY: {
    symbol: 'truthy',
    call: true,
    arity: 1,
    overloads: TEXT_TYPES.map((type) => ({ operands: [type], result: 'BOOLEAN' })),
    needs: 'needs a number, text, or true or false',
    apply: ([a]) => isTruthy(a)
  },
  TERNARY: {
    symbol: 'if',
    call: true,
    arity: 3,
    overloads: (['FLOAT', 'BOOLEAN', 'STRING', 'COLOR'] as const).map((type) => ({
      operands: ['BOOLEAN', type, type],
      result: type
    })),
    needs: 'needs true or false, then two values of the same type',
    apply: ([condition, then, otherwise]) => (condition === true ? then : otherwise)
  }
}

function arithmetic(symbol: string, apply: (a: number, b: number) => number): OperatorSignature {
  return {
    symbol,
    arity: 2,
    overloads: [{ operands: FLOAT_FLOAT, result: 'FLOAT' }],
    needs: 'needs numbers',
    apply: ([a, b]) => apply(Number(a), Number(b))
  }
}

function comparison(symbol: string, apply: (a: number, b: number) => boolean): OperatorSignature {
  return {
    symbol,
    arity: 2,
    overloads: [{ operands: FLOAT_FLOAT, result: 'BOOLEAN' }],
    needs: 'needs numbers',
    apply: ([a, b]) => apply(Number(a), Number(b))
  }
}

function equality(
  symbol: string,
  apply: (a: VariableLiteral, b: VariableLiteral) => boolean
): OperatorSignature {
  return {
    symbol,
    arity: 2,
    overloads: TEXT_TYPES.map((type) => ({ operands: [type, type], result: 'BOOLEAN' })),
    needs: 'compares two numbers, two texts, or two true or false values',
    apply: ([a, b]) => apply(a, b)
  }
}

function logic(symbol: string, apply: (a: boolean, b: boolean) => boolean): OperatorSignature {
  return {
    symbol,
    arity: 2,
    overloads: [{ operands: ['BOOLEAN', 'BOOLEAN'], result: 'BOOLEAN' }],
    needs: 'needs true or false',
    apply: ([a, b]) => apply(a === true, b === true)
  }
}

/** Text Figma reads as false besides the empty string, ignoring case and surrounding spaces. */
const FALSE_WORDS = new Set(['false', 'no', 'off'])

/** Figma's truth: a number other than 0, and text other than "", "false", "no" or "off". */
function isTruthy(value: VariableLiteral): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value !== '' && !FALSE_WORDS.has(value.trim().toLowerCase())
  return false
}

export function isFormulaOperation(node: VariableFormulaNode): node is VariableFormulaOperation {
  return typeof node === 'object' && 'operator' in node
}

export function formulaArity(operator: VariableFormulaOperator): number {
  return SIGNATURES[operator].arity
}

export function formulaSymbol(operator: VariableFormulaOperator): string {
  return SIGNATURES[operator].symbol
}

/** Written as a function call, such as `if(a, b, c)`, rather than around its operands. */
export function isFormulaCall(operator: VariableFormulaOperator): boolean {
  return SIGNATURES[operator].call === true
}

/** The operator a function call names, such as `TERNARY` for `if`. */
export function formulaCallOperator(name: string): VariableFormulaOperator | undefined {
  const lower = name.toLowerCase()
  return (Object.keys(SIGNATURES) as VariableFormulaOperator[]).find(
    (operator) => SIGNATURES[operator].call && SIGNATURES[operator].symbol === lower
  )
}

/** The types an operator can give when some operand types are unknown, written as `undefined`. */
export function formulaResultTypes(
  operator: VariableFormulaOperator,
  types: readonly (FormulaValueType | undefined)[]
): FormulaValueType[] {
  const { overloads, arity } = SIGNATURES[operator]
  if (types.length !== arity) return []
  const results = overloads
    .filter(({ operands }) =>
      operands.every((type, index) => types[index] === undefined || types[index] === type)
    )
    .map(({ result }) => result)
  return [...new Set(results)]
}

/** Check operand types against an operator's signatures; the message says what it needs. */
export function checkFormulaOperands(
  operator: VariableFormulaOperator,
  types: readonly FormulaValueType[]
): FormulaValueType {
  const { arity, symbol, call, needs } = SIGNATURES[operator]
  const name = call ? `${symbol}()` : symbol
  if (types.length !== arity) {
    if (!call) throw new VariableFormulaError(`Wrong number of operands for ${operator}`)
    throw new VariableFormulaError(`${name} takes ${arity} ${arity === 1 ? 'value' : 'values'}`)
  }
  const result = formulaResultTypes(operator, types).at(0)
  if (!result) throw new VariableFormulaError(`${name} ${needs}`)
  return result
}

function isColor(value: object): value is Color {
  const channels: Record<string, unknown> = { ...value }
  return ['r', 'g', 'b', 'a'].every((channel) => Number.isFinite(channels[channel]))
}

/** The type of a value a formula holds or a variable gives. */
export function formulaValueType(value: VariableLiteral): FormulaValueType {
  if (typeof value === 'number') return 'FLOAT'
  if (typeof value === 'boolean') return 'BOOLEAN'
  if (typeof value === 'string') return 'STRING'
  if (isColor(value)) return 'COLOR'
  throw new VariableFormulaError('Formulas use numbers, text, true or false, and colors')
}

/** Every operand is evaluated, so `false and` or `if()` with an invalid operand still fails. */
export function evaluateVariableFormula(
  node: VariableFormulaNode,
  resolve: (id: string) => VariableLiteral | undefined,
  depth = 0
): VariableLiteral {
  if (depth > MAX_FORMULA_DEPTH) throw new VariableFormulaError('Formula is too deeply nested')
  let result: VariableLiteral | undefined
  if (isFormulaOperation(node)) {
    if (!Object.hasOwn(SIGNATURES, node.operator))
      throw new VariableFormulaError(`Unknown formula operator ${String(node.operator)}`)
    const args = node.operands.map((operand) =>
      evaluateVariableFormula(operand, resolve, depth + 1)
    )
    checkFormulaOperands(node.operator, args.map(formulaValueType))
    result = SIGNATURES[node.operator].apply(args)
  } else if (typeof node === 'object' && 'aliasId' in node) {
    result = resolve(node.aliasId)
    if (result === undefined)
      throw new VariableFormulaError(`Cannot resolve variable ${node.aliasId}`)
  } else result = node
  formulaValueType(result)
  if (typeof result === 'number' && !Number.isFinite(result))
    throw new VariableFormulaError('Formula result must be finite')
  return result
}

export function mapFormulaReferences(
  node: VariableFormulaNode,
  map: (id: string) => string,
  depth = 0
): VariableFormulaNode {
  if (depth > MAX_FORMULA_DEPTH) throw new VariableFormulaError('Formula is too deeply nested')
  if (isFormulaOperation(node))
    return {
      operator: node.operator,
      operands: node.operands.map((n) => mapFormulaReferences(n, map, depth + 1))
    }
  if (typeof node !== 'object') return node
  if ('aliasId' in node) return { aliasId: map(node.aliasId) }
  return { ...node }
}

/**
 * The type a formula gives, checking each operator's operands on the way. `reference` gives a
 * variable's type, or nothing where it is not known, which any operand type then fits; the
 * result is nothing when it depends on such a reference.
 */
export function inferFormulaType(
  node: VariableFormulaNode,
  reference: (id: string) => FormulaValueType | undefined = () => undefined,
  depth = 0
): FormulaValueType | undefined {
  if (depth > MAX_FORMULA_DEPTH) throw new VariableFormulaError('Formula is too deeply nested')
  if (isFormulaOperation(node)) {
    const types = node.operands.map((operand) => inferFormulaType(operand, reference, depth + 1))
    if (types.every((type) => type !== undefined)) return checkFormulaOperands(node.operator, types)
    const results = formulaResultTypes(node.operator, types)
    if (!results.length)
      checkFormulaOperands(
        node.operator,
        types.map((type) => type ?? 'FLOAT')
      )
    return results.length === 1 ? results[0] : undefined
  }
  if (typeof node === 'object' && 'aliasId' in node) return reference(node.aliasId)
  return formulaValueType(node)
}
