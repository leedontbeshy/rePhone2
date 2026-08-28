export function paymentProofSelectionLabel(file: Pick<File, 'name'> | null): string {
  if (file === null) return 'Chưa chọn tệp';
  const name = file.name.trim();
  return name.length > 0 ? name : 'Tệp đã chọn';
}
