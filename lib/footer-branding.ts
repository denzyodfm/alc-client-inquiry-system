import { prisma } from "@/lib/prisma";

export const DEFAULT_FOOTER_BRANDING = {
  poweredByLabel: "Powered by",
  partnerName: "Valdemeer Resources, Inc",
  itTeamLabel: "IT TEAM - KAMARU"
};

export type FooterBrandingValues = typeof DEFAULT_FOOTER_BRANDING;

export async function getFooterBranding(): Promise<FooterBrandingValues> {
  const branding = await prisma.footerBranding.findUnique({
    where: { id: 1 },
    select: { poweredByLabel: true, partnerName: true, itTeamLabel: true }
  });
  return branding ?? DEFAULT_FOOTER_BRANDING;
}
