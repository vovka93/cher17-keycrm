import { RedisClient } from "bun";

const redis = new RedisClient("redis://redis:6379");

export default redis;
