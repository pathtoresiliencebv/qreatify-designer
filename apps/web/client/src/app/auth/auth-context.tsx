'use client';

import { SignInMethod } from '@onlook/models/auth';
import { useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

const LAST_SIGN_IN_METHOD_KEY = 'lastSignInMethod';

interface AuthContextType {
    signingInMethod: SignInMethod | null;
    lastSignInMethod: SignInMethod | null;
    isAuthModalOpen: boolean;
    setIsAuthModalOpen: (open: boolean) => void;
    handleLogin: (method: SignInMethod.GITHUB | SignInMethod.GOOGLE) => void;
    handleDevLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [lastSignInMethod, setLastSignInMethod] = useState<SignInMethod | null>(null);
    const [signingInMethod, setSigningInMethod] = useState<SignInMethod | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const { signIn } = useSignIn();
    const router = useRouter();

    useEffect(() => {
        void localforage.getItem(LAST_SIGN_IN_METHOD_KEY).then((lastSignInMethod) => {
            setLastSignInMethod(lastSignInMethod as SignInMethod | null);
        });
    }, []);

    const handleLogin = async (method: SignInMethod.GITHUB | SignInMethod.GOOGLE) => {
        if (!signIn) return;
        
        setSigningInMethod(method);
        
        try {
            const provider = method === SignInMethod.GITHUB ? 'oauth_github' : 'oauth_google';
            await signIn.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: '/projects',
                redirectUrlComplete: '/projects'
            });

            await localforage.setItem(LAST_SIGN_IN_METHOD_KEY, method);
        } catch (error) {
            console.error('Login error:', error);
            setSigningInMethod(null);
        }
    };

    const handleDevLogin = async () => {
        if (process.env.NODE_ENV !== 'development') {
            console.error('Dev login is only available in development mode');
            return;
        }
        
        setSigningInMethod(SignInMethod.DEV);
        
        // In development, redirect directly to projects
        setTimeout(() => {
            setSigningInMethod(null);
            router.push('/projects');
        }, 1000);
    };

    const contextValue = {
        signingInMethod,
        lastSignInMethod,
        handleLogin,
        handleDevLogin,
        isAuthModalOpen,
        setIsAuthModalOpen,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within a AuthProvider');
    }
    return context;
}; 