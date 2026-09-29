// Tải Blob (file Excel trả về từ API) xuống máy người dùng.
export const saveBlob = (blob: Blob, fileName: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
};
