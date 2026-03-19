const { create } = require("tar");
const process = require("process");
const package = require("./package.json");
const fileKey = `${package.name}-v${package.version}`;
const { execSync } = require("child_process");

execSync("yarn install --prod");

setTimeout(() => {
	create(
		{
			cwd: process.cwd(),
			file: `${fileKey}.tgz`,
			gzip: true,
			prefix: fileKey,
		},
		["target", "node_modules", "package.json", "resource", "ecosystem.config.yml"],
		(err) => {
			if (err) {
				console.error("pkg error");
				console.error(err);
			} else {
				console.info("pkg success");
				execSync("yarn install");
			}
		}
	);
}, 5000);
