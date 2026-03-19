class MemoryService {
  constructor(limit = 5) {
    this.limit = limit;
    this.interactions = [];
  }

  addInteraction(interaction) {
    this.interactions.unshift(interaction);
    this.interactions = this.interactions.slice(0, this.limit);
  }

  getInteractions() {
    return [...this.interactions];
  }

  getLastInteraction() {
    return this.interactions[0] || null;
  }

  resolveTranscript(transcript, lastInteraction) {
    const normalized = transcript.trim();

    if (!lastInteraction) {
      return normalized;
    }

    if (/^explain (it|this|that)$/i.test(normalized) || /^explain this error$/i.test(normalized)) {
      return `Explain this error: ${lastInteraction.result?.output || lastInteraction.responseText || ""}`.trim();
    }

    if (/^(rerun|run it again)$/i.test(normalized) && lastInteraction.entities?.command) {
      return lastInteraction.entities.command;
    }

    return normalized;
  }
}

const memoryService = new MemoryService(5);

export default memoryService;
