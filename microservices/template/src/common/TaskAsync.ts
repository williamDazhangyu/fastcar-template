import { AsyncResource } from "async_hooks";

class TaskAsync extends AsyncResource {
	protected callback: any;

	constructor(callback: any) {
		super("TaskAsync");
		this.callback = callback;
	}

	done(result?: any) {
		this.runInAsyncScope(this.callback, null, result);
		this.emitDestroy();
	}
}

export default TaskAsync;
