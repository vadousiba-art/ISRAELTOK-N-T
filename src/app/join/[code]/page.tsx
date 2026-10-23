import { AuthFrame } from "@/components/auth/AuthFrame";
import { JoinForm } from "@/components/auth/JoinForm";

export default async function JoinWithCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <AuthFrame>
      <JoinForm code={decodeURIComponent(code)} />
    </AuthFrame>
  );
}
