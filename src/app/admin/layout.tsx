import type { Metadata } from "next";

/**
 * The admin pages are internal tooling on a public deployment.
 *
 * Nothing here is confidential — every content table is public SELECT under RLS, so the
 * seeding dashboard shows only what /browse already shows. But it is build progress, not
 * product, and it has no business in a search result for "Live Grid".
 *
 * This is presentation, not protection. The actual gate is on the write path: POST
 * /api/admin/import fails closed when ADMIN_IMPORT_TOKEN is unset, so a deployment that
 * omits that variable cannot be written to at all.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
