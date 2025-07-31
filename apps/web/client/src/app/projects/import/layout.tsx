import { Routes } from '@/utils/constants';
import { auth } from '@clerk/nextjs/server';
import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
    title: 'Onlook',
    description: 'Onlook – Create Project',
};

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    const { userId } = await auth();
    if (!userId) {
        redirect(Routes.LOGIN);
    }
    return <>{children}</>;
}
