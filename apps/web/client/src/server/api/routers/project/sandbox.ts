import { env } from '@/env';
import { CodeSandbox, type SandboxBrowserSession } from '@codesandbox/sdk';
import { FreestyleSandboxes, type FreestyleDevServer } from 'freestyle-sandboxes';
import { getSandboxPreviewUrl } from '@onlook/constants';
import { shortenUuid } from '@onlook/utility/src/id';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const sdk = new CodeSandbox(env.CSB_API_KEY);
const freestyleSdk = new FreestyleSandboxes({
    apiKey: env.FREESTYLE_API_KEY,
});

export const sandboxRouter = createTRPCRouter({
    start: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                userId: z.string().optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const startData = await sdk.sandboxes.resume(input.sandboxId);
            const session = await startData.createBrowserSession({
                id: shortenUuid(input.userId ?? uuidv4(), 20),
            });
            return session as SandboxBrowserSession;
        }),
    hibernate: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            await sdk.sandboxes.hibernate(input.sandboxId);
        }),
    list: protectedProcedure.query(async () => {
        const listResponse = await sdk.sandboxes.list();
        return listResponse;
    }),
    fork: protectedProcedure
        .input(
            z.object({
                sandbox: z.object({
                    id: z.string(),
                    port: z.number(),
                }),
                config: z.object({
                    title: z.string().optional(),
                    tags: z.array(z.string()).optional(),
                }).optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const sandbox = await sdk.sandboxes.create({
                source: 'template',
                id: input.sandbox.id,

                // Metadata
                title: input.config?.title,
                tags: input.config?.tags,
            });

            const previewUrl = getSandboxPreviewUrl(sandbox.id, input.sandbox.port);

            return {
                sandboxId: sandbox.id,
                previewUrl,
            };
        }),
    delete: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            await sdk.sandboxes.shutdown(input.sandboxId);
        }),
    createFromGitHub: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string(),
                branch: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            // const fileOps = new FileOperations(session);
            // const sandbox = await sdk.sandboxes.create({
            //     source: 'git',
            //     url: input.repoUrl,
            //     branch: input.branch,
            //     async setup(session) {
            //         await addSetupTask(session);
            //         await updatePackageJson(session);
            //         await injectPreloadScript(session);
            //         await session.setup.run();
            //     },
            // });
            // return {
            //     sandboxId: sandbox.id,
            //     previewUrl: getSandboxPreviewUrl(sandbox.id, 3000),
            // };
            return {
                sandboxId: '123',
                previewUrl: 'https://sandbox.com',
            };
        }),
    requestFreestyleDevServer: protectedProcedure
        .input(
            z.object({
                repoId: z.string(),
                userId: z.string().optional(),
                devCommand: z.string().optional().default('npm run dev'),
                preDevCommandOnce: z.string().optional().default('npm install'),
                envVars: z.record(z.string()).optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const devServer = await freestyleSdk.requestDevServer({
                repoId: input.repoId,
                devCommand: input.devCommand,
                preDevCommandOnce: input.preDevCommandOnce,
                envVars: input.envVars,
                timeout: 300000, // 5 minutes timeout
            });
            return devServer;
        }),
    shutdownFreestyleDevServer: protectedProcedure
        .input(
            z.object({
                repoId: z.string(),
            }),
        )
        .mutation(async ({ input }) => {
            // For now, we'll just return success since shutdown is handled by the client
            return { success: true };
        }),
});
