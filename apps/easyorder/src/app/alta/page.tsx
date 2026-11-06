import { SignupView } from "@/components/alta/SignupView";
import { turnstileSiteKey } from "@/lib/turnstile";

export default function SignupPage() {
  return <SignupView captchaSiteKey={turnstileSiteKey()} />;
}
