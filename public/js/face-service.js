/**
 * FaceService - Biometric Face ID Enrollment & Anti-Proxy Attendance Verification
 * Powered by @vladmandic/face-api
 */
const FaceService = {
  isReady: false,
  isLoading: false,
  loadPromise: null,

  async init() {
    if (this.isReady) return true;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        if (typeof faceapi === 'undefined') {
          console.warn('[FaceService] faceapi library not loaded yet');
          return false;
        }

        const modelPath = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
        ]);

        this.isReady = true;
        this.isLoading = false;
        console.log('[FaceService] Face ID models loaded successfully');
        return true;
      } catch (err) {
        console.error('[FaceService] Failed to load face models:', err);
        this.isLoading = false;
        return false;
      }
    })();

    return this.loadPromise;
  },

  async extractDescriptor(element) {
    await this.init();
    if (!this.isReady || typeof faceapi === 'undefined') return null;

    try {
      const result = await faceapi
        .detectSingleFace(element, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!result) return null;

      return {
        descriptor: Array.from(result.descriptor),
        box: result.detection.box,
        score: result.detection.score
      };
    } catch (err) {
      console.error('[FaceService] extractDescriptor error:', err);
      return null;
    }
  },

  compare(desc1, desc2) {
    if (!desc1 || !desc2 || !Array.isArray(desc1) || !Array.isArray(desc2) || desc1.length !== 128 || desc2.length !== 128) {
      return { match: false, distance: 1.0, similarity: 0 };
    }

    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    // Euclidean distance threshold for 128-d descriptor (< 0.55 is verified same person)
    const match = distance < 0.55;
    const similarity = Math.max(0, Math.min(100, Math.round((1 - (distance / 0.8)) * 100)));

    return {
      match,
      distance: Math.round(distance * 1000) / 1000,
      similarity
    };
  },

  async enrollFace(descriptor, photo) {
    return await API.faceEnroll(descriptor, photo);
  }
};

window.FaceService = FaceService;
