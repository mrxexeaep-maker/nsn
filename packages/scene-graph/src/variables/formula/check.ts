import type {
  Color,
  VariableFormulaNode,
  VariableFormulaOperator,
  VariableLiteral
} from '@open-pencil/scene-graph'

import {
  formulaArity,
  formulaNeeds,
  formulaOverloads,
  isFormulaCall,
  type FormulaValueType
} from './signatures'
import { foldFormula, VariableFormulaError } from './tree'

/** The types an operator can give when some operand types are unknown, written as `undefined`. */
export function formulaResultTypes(
  operator: VariableFormulaOperator,
  types: readonly (FormulaValueType | undefined)[]
): FormulaValueType[] {
  if (types.length !== formulaArity(operator)) return []
  const results = formulaOverloads(operator)
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
  const arity = formulaArity(operator)
  const { name, needs } = formulaNeeds(operator)
  if (types.length !== arity) {
    if (!isFormulaCall(operator))
      throw new VariableFormulaError(`Wrong number of operands for ${operator}`)
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

/**
 * The type a formula gives, checking each operator's operands on the way. `reference` gives a
 * variable's type, or nothing where it is not known, which any operand type then fits; the
 * result is nothing when it depends on such a reference.
 */
export function inferFormulaType(
  node: VariableFormulaNode,
  reference: (id: string) => FormulaValueType | undefined = () => undefined
): FormulaValueType | undefined {
  return foldFormula<FormulaValueType | undefined>(node, {
    literal: formulaValueType,
    reference,
    operation: ({ operator }, types) => {
      if (types.every((type) => type !== undefined)) return checkFormulaOperands(operator, types)
      const results = formulaResultTypes(operator, types)
      if (!results.length)
        checkFormulaOperands(
          operator,
          types.map((type) => type ?? 'FLOAT')
        )
      return results.length === 1 ? results[0] : undefined
    }
  })
}
