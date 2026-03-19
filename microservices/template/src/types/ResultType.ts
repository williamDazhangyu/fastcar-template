export type ResultType<T> = {
	code: number;
	msg?: string;
	data?: T;
};
