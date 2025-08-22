export type PaginationResult<T> = {
	total: number;
	pageSize: number;
	pages: number;
	currentPage: number;
	prevPage: number | null;
	nextPage: number | null;
	filters: any;
	data: T[];
};
