export function getRulesFooterLinkPresentation(
  pathname: string,
  trackedItems: number,
) {
  return {
    ariaLabel:
      pathname === "/settings" ? "Close settings via rules list" : undefined,
    href: pathname === "/settings" ? "/" : undefined,
    label: `${trackedItems} rules`,
    title: pathname === "/settings" ? "Return to tracked rules" : undefined,
  };
}
