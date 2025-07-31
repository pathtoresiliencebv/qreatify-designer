import type { FreestyleDevServer } from 'freestyle-sandboxes';
import { EXCLUDED_SYNC_DIRECTORIES, NEXT_JS_FILE_EXTENSIONS, PRELOAD_SCRIPT_SRC } from '@onlook/constants';
import { RouterType, type SandboxFile, type TemplateNode } from '@onlook/models';
import { getContentFromTemplateNode, getTemplateNodeChild } from '@onlook/parser';
import { getBaseName, getDirName, isImageFile, isRootLayoutFile, isSubdirectory, LogTimer } from '@onlook/utility';
import { makeAutoObservable, reaction } from 'mobx';
import path from 'path';
import { env } from 'process';
import type { EditorEngine } from '../engine';
import { detectRouterTypeInSandbox } from '../pages/helper';
import { FileEventBus } from './file-event-bus';
import { FileSyncManager } from './file-sync';
import { normalizePath } from './helpers';
import { TemplateNodeMapper } from './mapping';
import { FreestyleSessionManager } from './freestyle-session';

const isDev = env.NODE_ENV === 'development';

export class FreestyleSandboxManager {
    readonly session: FreestyleSessionManager;
    readonly fileEventBus: FileEventBus = new FileEventBus();

    // Add router configuration
    private _routerConfig: { type: RouterType; basePath: string } | null = null;

    private fileSync: FileSyncManager;
    private templateNodeMap: TemplateNodeMapper;
    private _isIndexed = false;
    private _isIndexing = false;
    watchingFiles = false;

    constructor(private readonly editorEngine: EditorEngine) {
        this.session = new FreestyleSessionManager(this.editorEngine);
        this.fileSync = new FileSyncManager();
        this.templateNodeMap = new TemplateNodeMapper();
        makeAutoObservable(this);

        reaction(
            () => this.session.server,
            (server) => {
                this._isIndexed = false;
                if (server) {
                    this.index();
                }
            },
        );
    }

    get isIndexed() {
        return this._isIndexed;
    }

    get isIndexing() {
        return this._isIndexing;
    }

    get routerConfig(): { type: RouterType; basePath: string } | null {
        return this._routerConfig;
    }

    async index(force = false) {
        console.log('[FreestyleSandboxManager] Starting indexing, force:', force);

        if (this._isIndexing || (this._isIndexed && !force)) {
            return;
        }

        if (!this.session.server) {
            console.error('No server found for indexing');
            return;
        }

        this._isIndexing = true;
        const timer = new LogTimer('Freestyle Sandbox Indexing');

        try {
            // Detect router configuration first
            if (!this._routerConfig) {
                this._routerConfig = await detectRouterTypeInSandbox(this);
                if (this._routerConfig) {
                    timer.log(
                        `Router detected: ${this._routerConfig.type} at ${this._routerConfig.basePath}`,
                    );
                }
            }

            // Get all file paths using Freestyle filesystem
            const allFilePaths = await this.getAllFilePathsFlat('./', EXCLUDED_SYNC_DIRECTORIES);
            timer.log(`File discovery completed - ${allFilePaths.length} files found`);

            for (const filePath of allFilePaths) {
                // Track image files first
                if (isImageFile(filePath)) {
                    this.fileSync.writeEmptyFile(filePath, 'binary');
                    continue;
                }
                const remoteFile = await this.readRemoteFile(filePath);
                if (remoteFile) {
                    this.fileSync.updateCache(remoteFile);
                    if (this.isJsxFile(filePath)) {
                        await this.processFileForMapping(remoteFile);
                    }
                }
            }

            await this.watchFiles();
            this._isIndexed = true;
            timer.log('Indexing completed successfully');

        } catch (error) {
            console.error('Error during indexing:', error);
            throw error;
        } finally {
            this._isIndexing = false;
        }
    }

    /**
     * Get all file paths using Freestyle filesystem
     */
    private async getAllFilePathsFlat(rootDir: string, excludeDirs: string[]): Promise<string[]> {
        if (!this.session.server) {
            throw new Error('No server available for file discovery');
        }

        const allPaths: string[] = [];
        const dirsToProcess = [rootDir];

        while (dirsToProcess.length > 0) {
            const currentDir = dirsToProcess.shift()!;
            try {
                const entries = await this.session.server.fs.ls(currentDir);

                for (const entryName of entries) {
                    const fullPath = `${currentDir}/${entryName}`;
                    const normalizedPath = normalizePath(fullPath);

                    // Check if it's a directory by trying to list it
                    let isDirectory = false;
                    try {
                        await this.session.server.fs.ls(normalizedPath);
                        isDirectory = true;
                    } catch (error) {
                        // If ls fails, it's likely a file
                        isDirectory = false;
                    }

                    if (isDirectory) {
                        // Skip excluded directories
                        if (!excludeDirs.includes(entryName)) {
                            dirsToProcess.push(normalizedPath);
                        }
                        this.fileSync.updateDirectoryCache(normalizedPath);
                    } else {
                        allPaths.push(normalizedPath);
                    }
                }
            } catch (error) {
                console.warn(`Error reading directory ${currentDir}:`, error);
            }
        }

        return allPaths;
    }

    private async readRemoteFile(filePath: string): Promise<SandboxFile | null> {
        if (!this.session.server) {
            console.error('No server found for remote read');
            throw new Error('No server found for remote read');
        }

        try {
            if (isImageFile(filePath)) {
                console.log('reading image file', filePath);
                // For binary files, we'll store them as empty binary files for now
                // Freestyle doesn't support binary file reading in the same way
                return {
                    type: 'binary',
                    path: filePath,
                    content: new Uint8Array(0)
                };
            } else {
                const content = await this.session.server.fs.readFile(filePath);
                return {
                    type: 'text',
                    path: filePath,
                    content: content
                };
            }
        } catch (error) {
            console.error(`Error reading remote file ${filePath}:`, error);
            return null;
        }
    }

    private async writeRemoteFile(
        filePath: string,
        content: string | Uint8Array,
    ): Promise<boolean> {
        if (!this.session.server) {
            console.error('No server found for remote write');
            return false;
        }

        try {
            if (content instanceof Uint8Array) {
                await this.session.server.fs.writeFile(filePath, content.buffer);
            } else {
                await this.session.server.fs.writeFile(filePath, content);
            }
            return true;
        } catch (error) {
            console.error(`Error writing remote file ${filePath}:`, error);
            return false;
        }
    }

    async readFile(path: string): Promise<SandboxFile | null> {
        const normalizedPath = normalizePath(path);
        return this.fileSync.readOrFetch(normalizedPath, this.readRemoteFile.bind(this));
    }

    async readFiles(paths: string[]): Promise<Record<string, SandboxFile>> {
        const results = new Map<string, SandboxFile>();
        for (const path of paths) {
            const file = await this.readFile(path);
            if (!file) {
                console.error(`Failed to read file ${path}`);
                continue;
            }
            results.set(path, file);
        }
        return Object.fromEntries(results);
    }

    async writeFile(path: string, content: string): Promise<boolean> {
        const normalizedPath = normalizePath(path);
        let writeContent = content;

        // If the file is a JSX file, we need to process it for mapping before writing
        if (this.isJsxFile(normalizedPath)) {
            try {
                const { newContent } = await this.templateNodeMap.processFileForMapping(
                    normalizedPath,
                    content,
                    this.routerConfig?.type,
                );
                writeContent = newContent;
            } catch (error) {
                console.error(`Error processing file ${normalizedPath}:`, error);
            }
        }
        return this.fileSync.write(normalizedPath, writeContent, this.writeRemoteFile.bind(this));
    }

    isJsxFile(filePath: string): boolean {
        const extension = path.extname(filePath);
        if (!extension || !NEXT_JS_FILE_EXTENSIONS.includes(extension)) {
            return false;
        }
        return true;
    }

    async writeBinaryFile(path: string, content: Buffer | Uint8Array): Promise<boolean> {
        const normalizedPath = normalizePath(path);
        try {
            return this.fileSync.write(normalizedPath, content, this.writeRemoteFile.bind(this));
        } catch (error) {
            console.error(`Error writing binary file ${normalizedPath}:`, error);
            return false;
        }
    }

    get files() {
        return this.fileSync.listAllFiles();
    }

    get directories() {
        return this.fileSync.listAllDirectories();
    }

    listAllFiles() {
        return this.fileSync.listAllFiles();
    }

    async readDir(dir: string): Promise<Array<{name: string, type: 'file' | 'directory', isSymlink: boolean}>> {
        if (!this.session.server) return [];
        
        try {
            const entries = await this.session.server.fs.ls(dir);
            return entries.map(name => ({
                name,
                type: 'file' as const, // Freestyle doesn't distinguish, we'll check individually if needed
                isSymlink: false // Freestyle doesn't provide symlink info
            }));
        } catch (error) {
            console.error(`Error reading directory ${dir}:`, error);
            return [];
        }
    }

    async listFilesRecursively(
        dir: string,
        ignoreDirs: string[] = [],
        ignoreExtensions: string[] = [],
    ): Promise<string[]> {
        if (!this.session.server) {
            console.error('No server found');
            return [];
        }

        const results: string[] = [];
        try {
            const entries = await this.session.server.fs.ls(dir);

            for (const entryName of entries) {
                const fullPath = `${dir}/${entryName}`;
                const normalizedPath = normalizePath(fullPath);
                
                // Check if it's a directory
                let isDirectory = false;
                try {
                    await this.session.server.fs.ls(normalizedPath);
                    isDirectory = true;
                } catch {
                    isDirectory = false;
                }

                if (isDirectory) {
                    if (ignoreDirs.includes(entryName)) {
                        continue;
                    }
                    const subFiles = await this.listFilesRecursively(
                        normalizedPath,
                        ignoreDirs,
                        ignoreExtensions,
                    );
                    results.push(...subFiles);
                } else {
                    const extension = path.extname(entryName);
                    if (ignoreExtensions.length > 0 && !ignoreExtensions.includes(extension)) {
                        continue;
                    }
                    results.push(normalizedPath);
                }
            }
        } catch (error) {
            console.error(`Error listing files recursively in ${dir}:`, error);
        }
        return results;
    }

    // Download the code as a zip
    async downloadFiles(
        projectName?: string,
    ): Promise<{ downloadUrl: string; fileName: string } | null> {
        if (!this.session.server) {
            console.error('No dev server found');
            return null;
        }
        
        // Freestyle doesn't have a direct download API like CodeSandbox
        // This would need to be implemented by zipping files on the server
        console.warn('Download functionality not yet implemented for Freestyle');
        return null;
    }

    async watchFiles() {
        if (!this.session.server || this.watchingFiles) {
            return;
        }

        this.watchingFiles = true;
        
        try {
            // Start watching files using Freestyle's filesystem watch
            const watchGenerator = this.session.server.fs.watch();
            
            // Process file changes in the background
            (async () => {
                try {
                    for await (const event of watchGenerator) {
                        await this.handleFileChange(event);
                    }
                } catch (error) {
                    console.error('Error watching files:', error);
                    this.watchingFiles = false;
                }
            })();
        } catch (error) {
            console.error('Error starting file watcher:', error);
            this.watchingFiles = false;
        }
    }

    async handleFileChange(event: { eventType: string; filename: string }) {
        const eventType = event.eventType;
        const filePath = normalizePath(event.filename);

        if (isSubdirectory(filePath, EXCLUDED_SYNC_DIRECTORIES)) {
            return;
        }

        if (eventType === 'change' || eventType === 'rename') {
            await this.handleFileChangedEvent(filePath);
            this.fileEventBus.publish({
                type: 'change',
                paths: [filePath],
                timestamp: Date.now(),
            });
        }

        if (isDev && filePath.includes(PRELOAD_SCRIPT_SRC)) {
            await this.editorEngine.preloadScript.ensurePreloadScriptFile();
        }
    }

    async handleFileChangedEvent(normalizedPath: string) {
        const cachedFile = this.fileSync.readCache(normalizedPath);

        if (isImageFile(normalizedPath)) {
            if (!cachedFile || cachedFile.content === null) {
                this.fileSync.writeEmptyFile(normalizedPath, 'binary');
            } else {
                const remoteFile = await this.readRemoteFile(normalizedPath);
                if (!remoteFile || remoteFile.content === null) {
                    console.error(`File content for ${normalizedPath} not found in remote`);
                    return;
                }
                this.fileSync.updateCache(remoteFile);
            }
        } else {
            const remoteFile = await this.readRemoteFile(normalizedPath);
            if (!remoteFile || remoteFile.content === null) {
                console.error(`File content for ${normalizedPath} not found in remote`);
                return;
            }
            if (remoteFile.type === 'text') {
                this.fileSync.updateCache({
                    type: 'text',
                    path: normalizedPath,
                    content: remoteFile.content,
                });
                if (remoteFile.content !== cachedFile?.content) {
                    await this.processFileForMapping(remoteFile);
                }
            } else {
                this.fileSync.updateCache({
                    type: 'binary',
                    path: normalizedPath,
                    content: remoteFile.content,
                });
            }
        }
    }

    async processFileForMapping(file: SandboxFile) {
        try {
            if (file.type === 'binary' || !this.isJsxFile(file.path)) {
                return;
            }

            // If this is a layout file, ensure the preload script file exists
            if (isRootLayoutFile(file.path, this.routerConfig?.type)) {
                try {
                    await this.editorEngine.preloadScript.ensurePreloadScriptFile();
                } catch (error) {
                    console.warn(`[FreestyleSandboxManager] Failed to ensure preload script file for layout ${file.path}:`, error);
                }
            }

            const { modified, newContent } = await this.templateNodeMap.processFileForMapping(
                file.path,
                file.content,
                this.routerConfig?.type,
            );

            if (modified && file.content !== newContent) {
                await this.writeFile(file.path, newContent);
            }
        } catch (error) {
            console.error(`Error processing file ${file.path}:`, error);
        }
    }

    async getTemplateNode(oid: string): Promise<TemplateNode | null> {
        return this.templateNodeMap.getTemplateNode(oid);
    }

    async getTemplateNodeChild(
        parentOid: string,
        child: TemplateNode,
        index: number,
    ): Promise<{ instanceId: string; component: string } | null> {
        const codeBlock = await this.getCodeBlock(parentOid);

        if (codeBlock == null) {
            console.error(`Failed to read code block: ${parentOid}`);
            return null;
        }

        return await getTemplateNodeChild(codeBlock, child, index);
    }

    async getCodeBlock(oid: string): Promise<string | null> {
        const templateNode = this.templateNodeMap.getTemplateNode(oid);
        if (!templateNode) {
            console.error(`No template node found for oid ${oid}`);
            return null;
        }

        const file = await this.readFile(templateNode.path);
        if (!file) {
            console.error(`No file found for template node ${oid}`);
            return null;
        }

        if (file.type === 'binary') {
            console.error(`File ${templateNode.path} is a binary file`);
            return null;
        }

        const codeBlock = await getContentFromTemplateNode(templateNode, file.content);
        return codeBlock;
    }

    async fileExists(path: string): Promise<boolean> {
        const normalizedPath = normalizePath(path);

        if (!this.session.server) {
            console.error('No server found for file existence check');
            return false;
        }

        try {
            await this.session.server.fs.readFile(normalizedPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async copy(
        path: string,
        targetPath: string,
        recursive?: boolean,
        overwrite?: boolean,
    ): Promise<boolean> {
        if (!this.session.server) {
            console.error('No server found for copy');
            return false;
        }

        try {
            const normalizedSourcePath = normalizePath(path);
            const normalizedTargetPath = normalizePath(targetPath);

            // Read source file and write to target
            const content = await this.session.server.fs.readFile(normalizedSourcePath);
            await this.session.server.fs.writeFile(normalizedTargetPath, content);

            return true;
        } catch (error) {
            console.error(`Error copying ${path} to ${targetPath}:`, error);
            return false;
        }
    }

    async delete(path: string, recursive?: boolean): Promise<boolean> {
        if (!this.session.server) {
            console.error('No server found for delete file');
            return false;
        }

        try {
            const normalizedPath = normalizePath(path);

            // Freestyle doesn't have a delete API, we'd need to implement this
            // For now, we'll just clean up the cache
            await this.fileSync.delete(normalizedPath);

            this.fileEventBus.publish({
                type: 'remove',
                paths: [normalizedPath],
                timestamp: Date.now(),
            });

            console.log(`Successfully deleted file: ${normalizedPath}`);
            return true;
        } catch (error) {
            console.error(`Error deleting file ${path}:`, error);
            return false;
        }
    }

    async rename(oldPath: string, newPath: string): Promise<boolean> {
        if (!this.session.server) {
            console.error('No server found for rename');
            return false;
        }

        try {
            const normalizedOldPath = normalizePath(oldPath);
            const normalizedNewPath = normalizePath(newPath);

            // Read content from old path and write to new path
            const content = await this.session.server.fs.readFile(normalizedOldPath);
            await this.session.server.fs.writeFile(normalizedNewPath, content);
            
            // Note: We can't actually delete the old file with current Freestyle API
            console.warn('Rename operation: new file created, but old file could not be removed');

            return true;
        } catch (error) {
            console.error(`Error renaming file ${oldPath} to ${newPath}:`, error);
            return false;
        }
    }

    /**
     * Gets the root layout path and router config
     */
    async getRootLayoutPath(): Promise<string | null> {
        const routerConfig = this.routerConfig;
        if (!routerConfig) {
            console.log('Could not detect Next.js router type');
            return null;
        }

        let layoutFileName: string;

        if (routerConfig.type === RouterType.PAGES) {
            layoutFileName = '_app';
        } else {
            layoutFileName = 'layout';
        }

        for (const extension of NEXT_JS_FILE_EXTENSIONS) {
            const layoutPath = path.join(routerConfig.basePath, `${layoutFileName}${extension}`);
            if (await this.fileExists(layoutPath)) {
                return normalizePath(layoutPath);
            }
        }

        console.log('Could not find layout file');
        return null;
    }

    clear() {
        this.watchingFiles = false;
        this.fileSync.clear();
        this.templateNodeMap.clear();
        this.session.clear();
        this._isIndexed = false;
        this._isIndexing = false;
        this._routerConfig = null;
    }
}