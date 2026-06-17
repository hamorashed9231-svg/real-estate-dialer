class MockQueue<T = any> {
  private processor: ((job: { id: string; data: T }) => Promise<void>) | null = null;
  private isPaused = false;
  private jobList: T[] = [];

  constructor(name: string, url?: string, options?: any) {}

  process(fn: (job: { id: string; data: T }) => Promise<void>) {
    this.processor = fn;
  }

  async resume() {
    this.isPaused = false;
    this.triggerProcessing();
  }

  async pause() {
    this.isPaused = true;
  }

  async getWaitingCount(): Promise<number> {
    return this.jobList.length;
  }

  async add(data: T, options?: any): Promise<{ id: string; data: T }> {
    const job = { id: `job-${Math.floor(100000 + Math.random() * 900000)}`, data };
    this.jobList.push(data);
    
    const delay = options?.delay || 0;
    setTimeout(async () => {
      if (this.isPaused) return;
      const idx = this.jobList.indexOf(data);
      if (idx !== -1) {
        this.jobList.splice(idx, 1);
      }
      if (this.processor) {
        try {
          await this.processor(job);
        } catch (err) {
          console.error('[MOCK QUEUE JOB ERROR]', err);
        }
      }
    }, delay || 100);

    return job;
  }

  private triggerProcessing() {
    if (this.isPaused) return;
    const currentJobs = [...this.jobList];
    this.jobList = [];
    currentJobs.forEach((data) => {
      this.add(data);
    });
  }
}

export default MockQueue;
