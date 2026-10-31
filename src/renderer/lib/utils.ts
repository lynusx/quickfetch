export const cn = (
  ...classes: (string | undefined | boolean | null)[]
): string => classes.filter(Boolean).join(' ')
