import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Building2, CheckCircle, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function ResetPassword() {
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if there's a hash fragment with access_token (from email link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (type === 'recovery' && accessToken) {
        setIsValidSession(true);
      } else if (session) {
        setIsValidSession(true);
      }
      
      setCheckingSession(false);
    };

    checkSession();

    // Listen for auth state changes (when user clicks email link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      setError(passwordResult.error.errors[0].message);
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    
    const { error } = await supabase.auth.updateUser({
      password: password,
    });
    
    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      // Sign out and redirect to login after a delay
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/auth', { replace: true });
      }, 3000);
    }
  };

  if (checkingSession) {
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Cost Intelligence</h1>
          <p className="text-muted-foreground mt-1">Reset Your Password</p>
        </div>

        <Card>
          {!isValidSession ? (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Invalid or Expired Link</CardTitle>
                <CardDescription>
                  This password reset link is invalid or has expired. Please request a new one.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => navigate('/auth')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
              </CardFooter>
            </>
          ) : success ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <CardTitle className="text-lg">Password Reset Successful</CardTitle>
                <CardDescription>
                  Your password has been updated. Redirecting you to sign in...
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={() => navigate('/auth')}
                >
                  Sign In Now
                </Button>
              </CardFooter>
            </>
          ) : (
            <form onSubmit={handleResetPassword}>
              <CardHeader>
                <CardTitle className="text-lg">Create New Password</CardTitle>
                <CardDescription>
                  Enter your new password below. Make sure it's at least 6 characters.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Enter new password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full" 
                  onClick={() => navigate('/auth')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
