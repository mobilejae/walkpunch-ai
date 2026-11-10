import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
} from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { analyzeDefectWithAI } from '../services/gemini';
import { useInspectionStore } from '../store/inspectionStore';

const ZOOM_PRESETS = [
  { label: '1x', value: 0 },
  { label: '2x', value: 0.2 },
  { label: '3x', value: 0.45 },
  { label: '5x', value: 0.75 },
];

export default function WalkthroughScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasAudioPermission, setHasAudioPermission] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { defects, addDefect, updateDefect } = useInspectionStore();

  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  // Camera zoom state (0 = 1x wide, 1 = max hardware zoom)
  const [cameraZoom, setCameraZoom] = useState(0);
  const pinchState = useRef({
    initialDistance: 0,
    initialZoom: 0,
  });

  const analyzingCount = defects.filter((d) => d.status === 'analyzing').length;

  useEffect(() => {
    (async () => {
      const audioStatus = await AudioModule.requestRecordingPermissionsAsync();
      setHasAudioPermission(audioStatus.granted);
    })();
  }, []);

  function getTouchDistance(touches: any[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  }

  function handleCameraTouchStart(e: any) {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      pinchState.current.initialDistance = getTouchDistance(touches);
      pinchState.current.initialZoom = cameraZoom;
    }
  }

  function handleCameraTouchMove(e: any) {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2 && pinchState.current.initialDistance > 0) {
      const currentDistance = getTouchDistance(touches);
      const fingerSpreadDelta =
        (currentDistance - pinchState.current.initialDistance) / 280;
      const nextZoom = Math.min(
        Math.max(pinchState.current.initialZoom + fingerSpreadDelta, 0),
        1
      );
      setCameraZoom(Number(nextZoom.toFixed(3)));
    }
  }

  function handleCameraTouchEnd(e: any) {
    if (e.nativeEvent.touches.length < 2) {
      pinchState.current.initialDistance = 0;
    }
  }

  function formatDisplayZoom(zoomVal: number): string {
    const approxMultiplier = 1 + zoomVal * 5.3;
    return `${approxMultiplier.toFixed(1)}x`;
  }

  async function handleSnapAndStartVoice() {
    if (!cameraRef.current || isTakingPhoto) return;

    if (!hasAudioPermission) {
      const audioStatus = await AudioModule.requestRecordingPermissionsAsync();
      setHasAudioPermission(audioStatus.granted);
      if (!audioStatus.granted) {
        Alert.alert(
          'Microphone Permission Needed',
          'Enable microphone access to record voice descriptions.'
        );
        return;
      }
    }

    try {
      setIsTakingPhoto(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });

      if (!photo?.uri) {
        throw new Error('Failed to capture photo.');
      }

      setCapturedPhotoUri(photo.uri);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecordingVoice(true);
    } catch (error: any) {
      Alert.alert(
        'Capture Error',
        error?.message || 'Could not capture photo or start recording.'
      );
    } finally {
      setIsTakingPhoto(false);
    }
  }

  async function handleFinishVoiceAndQueueAi() {
    if (!capturedPhotoUri || !isRecordingVoice) return;

    try {
      await audioRecorder.stop();
      const audioUri = audioRecorder.uri;
      const photoUriToProcess = capturedPhotoUri;

      setIsRecordingVoice(false);
      setCapturedPhotoUri(null);

      const defectId = Date.now().toString();
      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      addDefect({
        id: defectId,
        photoUri: photoUriToProcess,
        audioUri: audioUri || null,
        timestamp,
        status: 'analyzing',
      });

      if (audioUri) {
        analyzeDefectWithAI(photoUriToProcess, audioUri)
          .then((aiResult) => {
            updateDefect(defectId, {
              status: 'ready',
              aiData: aiResult,
            });
          })
          .catch((err) => {
            updateDefect(defectId, {
              status: 'error',
              errorMessage: err?.message || 'AI analysis failed',
            });
          });
      } else {
        updateDefect(defectId, {
          status: 'error',
          errorMessage: 'No audio recorded. Tap Edit or Retry AI.',
        });
      }
    } catch (error: any) {
      setIsRecordingVoice(false);
      Alert.alert('Recording Error', error?.message || 'Could not save voice note.');
    }
  }

  async function handleCancelCapture() {
    try {
      if (isRecordingVoice) {
        await audioRecorder.stop();
      }
    } catch {}
    setIsRecordingVoice(false);
    setCapturedPhotoUri(null);
  }

  if (!cameraPermission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSubtitle}>
          WalkPunch AI needs camera access to photograph property defects during your walkthrough.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestCameraPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push('/')}
        >
          <Text style={styles.navButtonText}>← Home</Text>
        </TouchableOpacity>

        {analyzingCount > 0 ? (
          <View style={styles.aiStatusPill}>
            <ActivityIndicator size="small" color="#38BDF8" />
            <Text style={styles.aiStatusText}>
              AI Analyzing ({analyzingCount})...
            </Text>
          </View>
        ) : (
          <Text style={styles.topBarTitle}>Walkthrough Capture</Text>
        )}

        <TouchableOpacity
          style={styles.reviewBadgeButton}
          onPress={() => router.push('/review')}
        >
          <Text style={styles.reviewBadgeText}>Review ({defects.length})</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.cameraContainer}
        onTouchStart={handleCameraTouchStart}
        onTouchMove={handleCameraTouchMove}
        onTouchEnd={handleCameraTouchEnd}
      >
        {capturedPhotoUri ? (
          <Image source={{ uri: capturedPhotoUri }} style={styles.camera} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            zoom={cameraZoom}
          />
        )}

        {!capturedPhotoUri && (
          <View style={styles.zoomOverlayContainer}>
            <View style={styles.zoomReadoutPill}>
              <Text style={styles.zoomReadoutText}>
                🔍 {formatDisplayZoom(cameraZoom)} (Pinch or Tap)
              </Text>
            </View>

            <View style={styles.zoomPillsRow}>
              {ZOOM_PRESETS.map((preset) => {
                const isActive = Math.abs(cameraZoom - preset.value) < 0.08;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.zoomPill,
                      isActive && styles.zoomPillActive,
                    ]}
                    onPress={() => setCameraZoom(preset.value)}
                  >
                    <Text
                      style={[
                        styles.zoomPillText,
                        isActive && styles.zoomPillTextActive,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {isRecordingVoice && (
          <View style={styles.recordingBanner}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingBannerText}>
              Recording Voice Note... Speak defect location &amp; issue
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomControls}>
        {!isRecordingVoice ? (
          <>
            <Text style={styles.instructionText}>
              Pinch to zoom, then tap below to snap photo &amp; start voice note
            </Text>
            <TouchableOpacity
              style={[
                styles.captureButton,
                isTakingPhoto && styles.disabledButton,
              ]}
              onPress={handleSnapAndStartVoice}
              disabled={isTakingPhoto}
            >
              <Text style={styles.captureButtonText}>
                {isTakingPhoto
                  ? '📸 Capturing...'
                  : '📸 Snap Defect & Speak'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.instructionText}>
              Describe the room, defect, and trade repair needed:
            </Text>
            <View style={styles.recordingActionsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelCapture}
              >
                <Text style={styles.cancelButtonText}>✕ Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.finishButton}
                onPress={handleFinishVoiceAndQueueAi}
              >
                <Text style={styles.finishButtonText}>
                  ✓ Done Speaking (Send to AI)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  permissionSubtitle: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  navButton: {
    backgroundColor: '#334155',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  navButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  aiStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
    gap: 6,
  },
  aiStatusText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewBadgeButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  reviewBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  zoomOverlayContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  zoomReadoutPill: {
    backgroundColor: '#0F172ACC',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  zoomReadoutText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  zoomPillsRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172ACC',
    padding: 5,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  zoomPill: {
    width: 42,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  zoomPillActive: {
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  zoomPillText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '800',
  },
  zoomPillTextActive: {
    color: '#FFFFFF',
  },
  recordingBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: '#DC2626E6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  recordingBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bottomControls: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  instructionText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  captureButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
  recordingActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    backgroundColor: '#334155',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '800',
  },
  finishButton: {
    flex: 1,
    backgroundColor: '#16A34A',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});