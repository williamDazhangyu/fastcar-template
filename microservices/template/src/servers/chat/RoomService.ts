import { Service } from "@fastcar/core/annotation";
import { DataMap } from "@fastcar/core";
import { ClientSession } from "@fastcar/rpc";

@Service
export default class RoomService {
	private onlineMap: DataMap<number, ClientSession>;

	constructor() {
		this.onlineMap = new DataMap();
	}

	add(uid: number, session: ClientSession) {
		this.onlineMap.set(uid, session);
	}

	getSid(uid: number) {
		return this.onlineMap.get(uid);
	}

	del(uid: number) {
		this.onlineMap.delete(uid);
	}
}
