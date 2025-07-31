'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export async function checkAuthAndRedirect() {
    const { userId } = await auth();
    if (userId) {
        redirect('/projects');
    }
    redirect('/login');
}