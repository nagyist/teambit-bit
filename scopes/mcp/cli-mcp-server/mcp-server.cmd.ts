import { compact } from 'lodash';
import { CLIArgs, Command, CommandOptions } from '@teambit/cli';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

export type McpStartCmdOptions = {
  extended?: boolean;
  includeOnly?: string;
  includeAdditional?: string;
  exclude?: string;
  bitBin?: string;
  consumerProject?: boolean;
};

export class McpServerCmd implements Command {
  name = 'mcp-server [sub-command]';
  description =
    'Start the Bit CLI Model Context Protocol (MCP) server for programmatic and remote access to Bit commands.';
  alias = '';
  group = 'advanced';
  loader = false;
  options = [
    ['e', 'extended', 'Enable the full set of Bit CLI commands as MCP tools'],
    [
      '',
      'include-only <commands>',
      'Specify a subset of commands to expose as MCP tools. Use comma-separated list in quotes, e.g. "status,install,compile"',
    ],
    [
      '',
      'include-additional <commands>',
      'Add specific commands to the default MCP tools set. Use comma-separated list in quotes. Only applies when --extended is not used',
    ],
    [
      '',
      'exclude <commands>',
      'Prevent specific commands from being exposed as MCP tools. Use comma-separated list in quotes',
    ],
    ['', 'bit-bin <binary>', 'Specify the binary to use for running Bit commands (default: "bit")'],
    [
      '',
      'consumer-project',
      'For non-Bit workspaces that only consume Bit component packages. Enables only "schema", "show", and "remote_search" tools',
    ],
  ] as CommandOptions;
  commands: Command[] = [];

  constructor(private mcpServer: CliMcpServerMain) {}

  async wait(args: CLIArgs, flags: McpStartCmdOptions): Promise<void> {
    if (compact(args).length) {
      throw new Error(
        `"${args}" is not a subcommand of "mcp-server", please run "bit mcp-server --help" to list the subcommands`
      );
    }

    await this.mcpServer.runMcpServer(flags);
  }
}

export class McpStartCmd implements Command {
  name = 'start';
  description = 'Start the MCP server';
  extendedDescription = 'Start the Model Context Protocol (MCP) server with the specified configuration';
  alias = '';
  group = 'advanced';
  loader = false;
  options = [
    ['e', 'extended', 'Enable the full set of Bit CLI commands as MCP tools'],
    [
      '',
      'include-only <commands>',
      'Specify a subset of commands to expose as MCP tools. Use comma-separated list in quotes, e.g. "status,install,compile"',
    ],
    [
      '',
      'include-additional <commands>',
      'Add specific commands to the default MCP tools set. Use comma-separated list in quotes. Only applies when --extended is not used',
    ],
    [
      '',
      'exclude <commands>',
      'Prevent specific commands from being exposed as MCP tools. Use comma-separated list in quotes',
    ],
    ['', 'bit-bin <binary>', 'Specify the binary to use for running Bit commands (default: "bit")'],
    [
      '',
      'consumer-project',
      'For non-Bit workspaces that only consume Bit component packages. Enables only "schema", "show", and "remote_search" tools',
    ],
  ] as CommandOptions;

  constructor(private mcpServer: CliMcpServerMain) {}

  async wait(args: CLIArgs, flags: McpStartCmdOptions): Promise<void> {
    await this.mcpServer.runMcpServer(flags);
  }
}
