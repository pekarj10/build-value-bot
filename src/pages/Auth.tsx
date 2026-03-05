import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import logoImg from '@/assets/logo-new.png';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, isLoading: authLoading } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('unitrate-remember-me') !== 'false';
  });
  
  // Sign up form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');
  
  // Forgot password state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate inputs
    const emailResult = emailSchema.safeParse(loginEmail);
    if (!emailResult.success) {
      setError(emailResult.error.errors[0].message);
      return;
    }
    
    const passwordResult = passwordSchema.safeParse(loginPassword);
    if (!passwordResult.success) {
      setError(passwordResult.error.errors[0].message);
      return;
    }

    // Save remember-me preference and configure storage
    localStorage.setItem('unitrate-remember-me', rememberMe ? 'true' : 'false');
    if (!rememberMe) {
      // Move session to sessionStorage so it expires on tab close
      supabase.auth.setSession as any; // will clear after sign-in below
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (!error && !rememberMe) {
      // Copy session to sessionStorage and remove from localStorage
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        sessionStorage.setItem('sb-session-forget', 'true');
      }
    }
    
    setIsLoading(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('Please confirm your email address before logging in.');
      } else {
        setError(error.message);
      }
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate inputs
    const emailResult = emailSchema.safeParse(signupEmail);
    if (!emailResult.success) {
      setError(emailResult.error.errors[0].message);
      return;
    }
    
    const passwordResult = passwordSchema.safeParse(signupPassword);
    if (!passwordResult.success) {
      setError(passwordResult.error.errors[0].message);
      return;
    }
    
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupFullName);
    setIsLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError(error.message);
      }
    } else {
      setSuccess('Account created! Please check your email (including spam folder) to verify your account before signing in.');
      setSignupEmail('');
      setSignupPassword('');
      setSignupConfirmPassword('');
      setSignupFullName('');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const emailResult = emailSchema.safeParse(resetEmail);
    if (!emailResult.success) {
      setError(emailResult.error.errors[0].message);
      return;
    }

    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setResetSuccess(true);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoImg} alt="Unit Rate" className="h-16 w-16 rounded-2xl object-contain mb-4 mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Unit Rate</h1>
          <p className="text-muted-foreground mt-1">Construction Cost Analysis Platform</p>
        </div>

        <Card>
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <CardTitle className="text-lg">Welcome back</CardTitle>
                  <CardDescription>
                    Enter your credentials to access your projects
                  </CardDescription>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <Dialog open={forgotPasswordOpen} onOpenChange={(open) => {
                        setForgotPasswordOpen(open);
                        if (!open) {
                          setResetEmail('');
                          setResetSuccess(false);
                          setError(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="link" className="px-0 h-auto text-xs text-muted-foreground">
                            Forgot password?
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          {!resetSuccess ? (
                            <form onSubmit={handleForgotPassword}>
                              <DialogHeader>
                                <DialogTitle>Reset your password</DialogTitle>
                                <DialogDescription>
                                  Enter your email address and we'll send you a link to reset your password.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                {error && (
                                  <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                  </Alert>
                                )}
                                <div className="space-y-2">
                                  <Label htmlFor="reset-email">Email</Label>
                                  <Input
                                    id="reset-email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button type="submit" disabled={resetLoading}>
                                  {resetLoading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Sending...
                                    </>
                                  ) : (
                                    'Send Reset Link'
                                  )}
                                </Button>
                              </DialogFooter>
                            </form>
                          ) : (
                            <div className="text-center py-4">
                              <div className="mb-4">
                                <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                                  <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                              <DialogHeader>
                                <DialogTitle>Check your email</DialogTitle>
                                <DialogDescription className="mt-2">
                                  We've sent a password reset link to <strong>{resetEmail}</strong>. 
                                  Click the link in the email to reset your password.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter className="mt-4">
                                <Button 
                                  variant="outline" 
                                  onClick={() => setForgotPasswordOpen(false)}
                                  className="w-full"
                                >
                                  Close
                                </Button>
                              </DialogFooter>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label htmlFor="remember-me" className="text-sm font-normal text-muted-foreground cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp}>
                <CardContent className="space-y-4">
                  <CardTitle className="text-lg">Create an account</CardTitle>
                  <CardDescription>
                    Start analyzing costs for your construction projects
                  </CardDescription>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="border-success/20 bg-success/10 text-success">
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          By signing up, you agree to our{' '}
          <Link to="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>
          {' '}and{' '}
          <Link to="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}