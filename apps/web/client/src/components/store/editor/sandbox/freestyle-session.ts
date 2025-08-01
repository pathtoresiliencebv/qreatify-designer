import { api } from '@/trpc/client';
import { FreestyleSandboxes, type FreestyleDevServer } from 'freestyle-sandboxes';
import { makeAutoObservable } from 'mobx';
import type { EditorEngine } from '../engine';
import { CLISessionImpl, CLISessionType, type CLISession, type TerminalSession } from './terminal';

export class FreestyleSessionManager {
    server: FreestyleDevServer | null = null;
    isConnecting = false;
    terminalSessions: Map<string, CLISession> = new Map();
    activeTerminalSessionId: string = 'cli';
    private client: FreestyleSandboxes;
    
    // For backward compatibility with existing code that expects 'session'
    get session(): any {
        if (!this.server) return null;
        
        // Create a compatibility adapter that maps FreestyleDevServer to WebSocketSession interface
        return {
            ...this.server,
            fs: this.server.fs,
            commands: {
                run: (command: string) => this.server?.process.exec(command).then(r => r.stdout?.join('\n') || '')
            },
            git: {
                // Mock git functionality - would need to be implemented via Freestyle process exec
                commit: async () => ({ hash: 'mock-hash' }),
                push: async () => ({ success: true }),
                status: async () => ({ files: [] })
            },
            disconnect: () => this.server?.shutdown(),
            reconnect: () => Promise.resolve(),
            keepActiveWhileConnected: () => {},
        };
    }

    constructor(private readonly editorEngine: EditorEngine) {
        makeAutoObservable(this);
        // Only initialize FreestyleSandboxes if API key is available
        try {
            this.client = new FreestyleSandboxes();
        } catch (error) {
            console.warn('FreestyleSandboxes initialization failed - likely missing API key:', error);
            // Create a no-op client to prevent crashes
            this.client = {} as FreestyleSandboxes;
        }
    }

    async start(repoId: string, userId?: string) {
        if (this.isConnecting || this.server) {
            return;
        }
        
        // Check if client is properly initialized
        if (!this.client || Object.keys(this.client).length === 0) {
            console.warn('FreestyleSandboxes client not initialized - skipping start');
            return;
        }
        
        this.isConnecting = true;
        
        try {
            // Request a dev server from Freestyle via API
            const serverData = await api.sandbox.requestFreestyleDevServer.mutate({ 
                repoId, 
                userId,
                devCommand: 'npm run dev',
                preDevCommandOnce: 'npm install'
            });
            this.server = serverData;
            
            this.isConnecting = false;
            await this.createTerminalSessions();
        } catch (error) {
            console.error('Failed to start Freestyle dev server:', error);
            this.isConnecting = false;
            throw error;
        }
    }

    getTerminalSession(id: string) {
        return this.terminalSessions.get(id) as TerminalSession | undefined;
    }

    async createTerminalSessions() {
        if (!this.server) return;
        
        // Create terminal sessions using Freestyle dev server
        const task = new FreestyleCLISession('Server (readonly)', CLISessionType.TASK, this.server, this.editorEngine.error);
        this.terminalSessions.set(task.id, task);
        
        const terminal = new FreestyleCLISession('CLI', CLISessionType.TERMINAL, this.server, this.editorEngine.error);
        this.terminalSessions.set(terminal.id, terminal);
        this.activeTerminalSessionId = task.id;
    }

    async disposeTerminal(id: string) {
        const terminal = this.terminalSessions.get(id) as TerminalSession | undefined;
        if (terminal) {
            if (terminal.type === 'terminal') {
                // Freestyle dev server terminals are managed differently
                terminal.xterm?.dispose();
            }
            this.terminalSessions.delete(id);
        }
    }

    async hibernate(repoId: string) {
        if (this.server) {
            await this.server.shutdown();
        }
    }

    async reconnect(repoId: string, userId?: string) {
        try {
            if (!this.server) {
                console.error('No server found');
                return;
            }

            // Check if the server is still running
            const isConnected = await this.ping();
            if (isConnected) {
                return;
            }

            // Restart the dev server
            await this.start(repoId, userId);
        } catch (error) {
            console.error('Failed to reconnect to dev server', error);
            this.isConnecting = false;
        }
    }

    async ping() {
        if (!this.server) return false;
        try {
            const status = await this.server.status();
            return true;
        } catch (error) {
            console.error('Failed to ping dev server', error);
            return false;
        }
    }

    async runCommand(command: string, streamCallback?: (output: string) => void): Promise<{
        output: string;
        success: boolean;
        error: string | null;
    }> {
        try {
            if (!this.server) {
                throw new Error('No server found');
            }
            
            streamCallback?.(command + '\n');
            const result = await this.server.process.exec(command);
            const output = (result.stdout || []).join('\n') + (result.stderr || []).join('\n');
            streamCallback?.(output);
            
            return {
                output,
                success: true,
                error: null
            };
        } catch (error) {
            console.error('Error running command:', error);
            return {
                output: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    async clear() {
        if (this.server) {
            await this.server.shutdown();
            this.server = null;
        }
        this.isConnecting = false;
        this.terminalSessions.forEach(terminal => {
            if (terminal.type === 'terminal') {
                terminal.xterm?.dispose();
            }
        });
        this.terminalSessions.clear();
    }
}

// Custom CLI Session implementation for Freestyle
class FreestyleCLISession implements CLISession {
    id: string;
    name: string;
    type: CLISessionType;
    xterm: any = null;
    terminal: any = null;
    task: any = null;
    private server: FreestyleDevServer;
    private errorManager: any;

    constructor(name: string, type: CLISessionType, server: FreestyleDevServer, errorManager: any) {
        this.id = type === CLISessionType.TASK ? 'task' : 'cli';
        this.name = name;
        this.type = type;
        this.server = server;
        this.errorManager = errorManager;
    }

    async exec(command: string): Promise<{ output: string; success: boolean }> {
        try {
            const result = await this.server.process.exec(command);
            return {
                output: (result.stdout || []).join('\n') + (result.stderr || []).join('\n'),
                success: true
            };
        } catch (error) {
            return {
                output: error instanceof Error ? error.message : 'Unknown error',
                success: false
            };
        }
    }
}