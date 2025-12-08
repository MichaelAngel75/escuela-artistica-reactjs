import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import logoImage from "@assets/generated_images/academic_logo_for_poluazticali.png";

export default function LoginPage() {
  const { login, user } = useAppStore();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation('/dashboard');
    return null;
  }

  const handleGoogleLogin = () => {
    // Mock login process
    login();
    setLocation('/dashboard');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-2">
             <img src={logoImage} alt="Poluazticali" className="w-12 h-12 object-contain" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-serif text-primary">Poluazticali</CardTitle>
            <CardDescription className="text-base">
              Academic Certification Platform
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground mb-4">
            Please sign in with your institutional account
          </div>
          
          <Button 
            variant="outline" 
            className="w-full h-12 text-base font-medium relative hover:bg-primary/5 hover:text-primary hover:border-primary transition-all"
            onClick={handleGoogleLogin}
          >
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Sign in with Google
          </Button>

          <div className="pt-4 text-center text-xs text-muted-foreground">
            Protected by OAuth 2.0 Security
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
