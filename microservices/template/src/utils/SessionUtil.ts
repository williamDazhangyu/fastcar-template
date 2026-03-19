import { SessionAttribute } from "@/types/SessionAttribute";
import { ValidationUtil } from "@fastcar/core/utils";

export default class SessionUtil {
	static createSessionByUid({ uid, serviceId, serverType, tid }: { uid?: number; serviceId?: string; serverType?: string; tid?: string }) {
		let settings = new Map();
		if (ValidationUtil.isNumber(uid)) {
			settings.set(SessionAttribute.uid, uid);
		}

		if (ValidationUtil.isNotNull(serviceId)) {
			settings.set(SessionAttribute.serviceId, serviceId);
		}

		if (ValidationUtil.isNotNull(serverType)) {
			settings.set(SessionAttribute.serverType, serverType);
		}

		if (ValidationUtil.isNotNull(tid)) {
			settings.set(SessionAttribute.tid, tid);
		}

		settings.set(SessionAttribute.logged, true);

		return {
			serverId: "",
			sessionId: "",
			settings,
			connectedTime: 0,
		};
	}

	static createSessionByServiceId({ serviceId }: { serviceId: string }) {
		let settings = new Map();

		settings.set(SessionAttribute.serviceId, serviceId);
		settings.set(SessionAttribute.logged, true);

		return {
			serverId: serviceId,
			sessionId: "",
			settings,
			connectedTime: 0,
		};
	}
}
