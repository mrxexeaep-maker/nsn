import * as v from 'valibot'

import {
  VARIABLE_FORMULA_OPERATORS,
  type VariableFormula,
  type VariableFormulaNode
} from '@open-pencil/scene-graph/types'

import { variableAliasSchema } from '../schema'
import { MAX_FORMULA_DEPTH, formulaArity, inferFormulaType } from './evaluate'

type NodeSchema = v.GenericSchema<unknown, VariableFormulaNode>

const finiteNumber = v.pipe(v.number(), v.finite())
const literal = v.union([
  finiteNumber,
  v.boolean(),
  v.string(),
  variableAliasSchema,
  v.object({ r: finiteNumber, g: finiteNumber, b: finiteNumber, a: finiteNumber })
])

/** A bounded recursive schema rejects excessively deep data before traversing it. */
function nodeSchema(depth: number, cache: Map<number, NodeSchema>): NodeSchema {
  const cached = cache.get(depth)
  if (cached) return cached
  const schema: NodeSchema =
    depth === 0
      ? literal
      : v.union([
          literal,
          v.pipe(
            v.object({
              operator: v.picklist(VARIABLE_FORMULA_OPERATORS),
              operands: v.pipe(
                v.array(nodeSchema(depth - 1, cache)),
                v.minLength(1),
                v.maxLength(3)
              )
            }),
            v.check(
              (node) => node.operands.length === formulaArity(node.operator),
              'Wrong number of operands'
            )
          )
        ])
  cache.set(depth, schema)
  return schema
}

/** Operand types are checked where the data shows them; a reference fits any operand. */
function fitsType(formula: VariableFormula) {
  try {
    const type = inferFormulaType(formula.value)
    return type === undefined || type === formula.type
  } catch {
    return false
  }
}

export const variableFormulaSchema: v.GenericSchema<unknown, VariableFormula> = v.pipe(
  v.object({
    expression: v.literal('FORMULA'),
    type: v.picklist(['FLOAT', 'BOOLEAN', 'STRING', 'COLOR']),
    value: nodeSchema(MAX_FORMULA_DEPTH, new Map())
  }),
  v.check(fitsType, 'Formula operands do not fit their operators')
)
