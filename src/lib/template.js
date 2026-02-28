export const fillTemplate = (template, values = {}) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? '')),
    template
  );
