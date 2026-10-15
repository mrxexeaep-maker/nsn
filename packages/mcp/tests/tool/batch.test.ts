import { expect, test } from 'bun:test'

import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, isAtomicTool } from '@open-pencil/core/tools'

import { registerTools } from '#mcp/tool/registration'

test('MCP exposes native batches, executes them through editor history, and retains permissions', async () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const nodes = [figma.createFrame(), figma.createFrame()]
  const ids = nodes.map((node) => node.id)
  const server = new McpServer({ name: 'batch-contract', version: '1' })
  const client = new Client({ name: 'batch-contract', version: '1' })
  const request = v.object({
    command: v.literal('tool'),
    args: v.object({ name: v.string(), args: v.record(v.string(), v.unknown()) })
  })
  let executions = 0
  registerTools(server, {
    policy: { allowEval: false, disabledTools: ['set_font'], scope: 'document' },
    sendRPC: async (body) => {
      const { args } = v.parse(request, body)
      const tool = ALL_TOOLS.find((candidate) => candidate.name === args.name)
      if (!tool) throw new Error('Missing tool')
      executions++
      return {
        ok: true,
        result: isAtomicTool(tool)
          ? executeAtomicTool(editor, figma, tool, args.args)
          : tool.execute(figma, args.args)
      }
    }
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const { tools } = await client.listTools()
    expect(tools.some((tool) => tool.name === 'set_font')).toBe(false)
    expect(
      tools.find((tool) => tool.name === 'set_opacity')?.inputSchema.properties?.ids
    ).toMatchObject({ type: 'array', maxItems: 200 })
    expect((await client.callTool({ name: 'set_opacity', arguments: { ids } })).isError).toBe(true)
    expect(executions).toBe(0)
    expect(
      (await client.callTool({ name: 'set_opacity', arguments: { ids, value: 0.4 } })).isError
    ).not.toBe(true)
    expect(executions).toBe(1)
    expect(nodes.map((node) => node.opacity)).toEqual([0.4, 0.4])
    editor.undo.undo()
    expect(nodes.map((node) => node.opacity)).toEqual([1, 1])
    expect(
      (
        await client.callTool({
          name: 'set_opacity',
          arguments: { ids: [ids[0], 'missing'], value: 0.2 }
        })
      ).isError
    ).toBe(true)
    expect(nodes.map((node) => node.opacity)).toEqual([1, 1])
    expect(
      (
        await client.callTool({
          name: 'set_opacity',
          arguments: { items: [{ id: ids[0], value: 'not a number' }] }
        })
      ).isError
    ).toBe(true)
    expect(executions).toBe(2)
    expect(
      (
        await client.callTool({
          name: 'get_node',
          arguments: { items: ids.map((id) => ({ id, depth: 0 })) }
        })
      ).isError
    ).not.toBe(true)
  } finally {
    await client.close()
    await server.close()
    editor.dispose()
  }
})
