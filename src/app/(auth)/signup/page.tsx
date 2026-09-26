import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { SignUpForm } from "./signup-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Set up your Clientdesk account.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm next={next ?? null} googleEnabled={isGoogleAuthEnabled()} />
      </CardContent>
    </Card>
  );
}
