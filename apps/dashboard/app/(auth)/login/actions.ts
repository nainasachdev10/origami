'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'

export async function loginWithEmail(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Email and password are required.' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error?.message === 'Invalid login credentials') {
    // User doesn't exist yet — sign them up (auto-signup on first attempt)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
      },
    })
    if (signUpError) return { error: signUpError.message }
    // Signup succeeded but email confirmation is required
    return { needsConfirmation: true, email }
  } else if (error?.message === 'Email not confirmed') {
    return { needsConfirmation: true, email }
  } else if (error) {
    return { error: error.message }
  }

  redirect('/projects')
}

export async function resendConfirmationEmail(email: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function loginWithGoogle(): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    return { url: null, error: error.message }
  }

  return { url: data.url, error: null }
}
