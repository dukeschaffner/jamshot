const LINK_PLACEHOLDER = /\{link\}/gi;

export function formatOutreachMessage(
  body: string | null | undefined,
  shortUrl: string
): string {
  if (!body) return '';
  return body.replace(LINK_PLACEHOLDER, shortUrl);
}

export function resolveOutreachMessageBody(
  linkBody: string | null | undefined,
  variants: Array<{ id: number; body?: string | null }>,
  variantId: number
): string {
  return (
    linkBody ||
    variants.find((variant) => variant.id === variantId)?.body ||
    ''
  );
}
