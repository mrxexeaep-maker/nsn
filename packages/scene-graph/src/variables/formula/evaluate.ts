import type { VariableFormulaNode, VariableLiteral } from '@open-pencil/scene-graph'

import { checkFormulaOperands, formulaValueType } from './check'
import { applyFormulaOperator, isFormulaOperator } from './signatures'
import { foldFormula, VariableFormulaError } from './tree'

/** Every operand is evaluated, so `false and` or `if()` with an invalid operand still fails. */
export function evaluateVariableFormula(
  node: VariableFormulaNode,
  resolve: (id: string) => VariableLiteral | undefined
): VariableLiteral {
  const checked = (value: VariableLiteral) => {
    formulaValueType(value)
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new VariableFormulaError('Formula result must be finite')
    return value
  }
  return foldFormula<VariableLiteral>(node, {
    literal: checked,
    reference: (id) => {
      const value = resolve(id)
      if (value === undefined) throw new VariableFormulaError(`Cannot resolve variable ${id}`)
      return checked(value)
    },
    operation: ({ operator }, operands) => {
      if (!isFormulaOperator(operator))
        throw new VariableFormulaError(`Unknown formula operator ${String(operator)}`)
      checkFormulaOperands(operator, operands.map(formulaValueType))
      return checked(applyFormulaOperator(operator, operands))
    }
  })
}
