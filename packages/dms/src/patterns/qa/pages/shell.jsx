import React from "react";
import { useAuth } from "../../auth/context";

// Renders the page pattern's context shell with the live signed-in user. The wrapper caches
// each route's render on its own rows (dms-manager/wrapper.jsx), so a shell rendered while
// the user was still loading keeps that placeholder user in CMSContext, and PageView renders
// nothing for a gated page. QA pages load fast enough to render in that window; reading
// AuthContext here re-renders the shell when the real user arrives (same user as withAuth).
export default function QaShell({ Shell, ...props }) {
  const auth = useAuth();
  const user = auth?.viewAsUser ?? auth?.user ?? props.user;
  return <Shell {...props} user={user} />;
}
