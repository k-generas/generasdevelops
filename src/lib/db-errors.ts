type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

export function isMissingSchemaError(error: PostgrestLikeError): boolean {
  if (error.code === "42P01" || error.code === "PGRST204" || error.code === "PGRST205") {
    return true;
  }
  return /does not exist|could not find the table|could not find the .* column|schema cache/i.test(
    error.message ?? "",
  );
}
