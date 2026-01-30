import { RedisClient } from "bun";

const redis = new RedisClient(Bun.env["REDIS_URL"]);

export default redis;
