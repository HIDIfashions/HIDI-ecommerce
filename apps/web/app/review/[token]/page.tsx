import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Invitation",
  robots: { index: false, follow: false },
};

import { ReviewInvitationClient } from "./review-invitation-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReviewInvitationClient token={token} />;
}
