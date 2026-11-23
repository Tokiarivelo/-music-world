from arq.connections import ArqRedis

RUN_JOB_FUNCTION = "run_job"


class ArqJobQueue:
    def __init__(self, redis: ArqRedis) -> None:
        self._redis = redis

    async def enqueue(self, job_id: str) -> None:
        # arq job id = our job id: enqueuing twice is a no-op.
        await self._redis.enqueue_job(RUN_JOB_FUNCTION, job_id, _job_id=job_id)
