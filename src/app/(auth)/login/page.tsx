import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Sign in to your Clientdesk workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next ?? null} googleEnabled={isGoogleAuthEnabled()} />
      </CardContent>
    </Card>
  );
}
