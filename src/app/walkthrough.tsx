import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { analyzeDefectWithAI, ParsedPunchItem } from '../services/gemini';

interface CapturedDefect {
  id: string;
  photoUri: string;
  audioUri: string | null;
  timestamp: string;
  status: 'analyzing' | 'ready' | 'error';
  aiData?: ParsedPunchItem;
  errorMessage?: string;
  expanded?: boolean;
}

export default function WalkthroughScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micGranted, setMicGranted] = useState<boolean | null>(null);

  // Switched to LOW_QUALITY preset for instant 2-second audio uploads
  const audioRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const audioPlayer = useAudioPlayer(null);
  const [isRecording, setIsRecording] = useState(false);

  const [currentPhotoUri, setCurrentPhotoUri] = useState<string | null>(null);
  const [defects, setDefects] = useState<CapturedDefect[]>([]);

  useEffect(() => {
    async function checkMicPermission() {
      const status = await AudioModule.getRecordingPermissionsAsync();
      setMicGranted(status.granted);
    }
    checkMicPermission();
  }, []);

  const requestPermissions = async () => {
    await requestCameraPermission();
    const status = await AudioModule.requestRecordingPermissionsAsync();
    setMicGranted(status.granted);
  };

  if (!cameraPermission || micGranted === null) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>Checking permissions...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !micGranted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionTitle}>Camera & Mic Access Needed</Text>
        <Text style={styles.permissionSubtitle}>
          WalkPunch AI needs camera access to photograph defects and microphone access for voice notes.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermissions}>
          <Text style={styles.grantButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4 });
      if (photo?.uri) {
        setCurrentPhotoUri(photo.uri);
      }
    } catch (error) {
      Alert.alert('Camera Error', 'Failed to snap photo.');
    }
  }

  async function startRecording() {
    if (!currentPhotoUri) {
      Alert.alert('Snap Photo First', 'Take a photo of the defect first, then record your voice note.');
      return;
    }
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch (error) {
      Alert.alert('Microphone Error', 'Could not start audio recording.');
    }
  }

  async function stopRecordingAndAnalyze() {
    if (!isRecording || !currentPhotoUri) return;
    setIsRecording(false);

    try {
      await audioRecorder.stop();
      const audioUri = audioRecorder.uri;
      const capturedPhoto = currentPhotoUri;
      const itemId = Date.now().toString();

      const initialItem: CapturedDefect = {
        id: itemId,
        photoUri: capturedPhoto,
        audioUri: audioUri,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'analyzing',
        expanded: false,
      };

      setDefects((prev) => [initialItem, ...prev]);
      setCurrentPhotoUri(null);

      if (!audioUri) {
        throw new Error('Audio URI missing.');
      }

      const aiResult = await analyzeDefectWithAI(capturedPhoto, audioUri);

      setDefects((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: 'ready', aiData: aiResult } : item
        )
      );
    } catch (error: any) {
      const msg = error?.message || 'AI parsing failed';
      setDefects((prev) =>
        prev.map((item, idx) =>
          idx === 0 && item.status === 'analyzing'
            ? { ...item, status: 'error', errorMessage: msg }
            : item
        )
      );
      Alert.alert('AI Analysis Issue', msg);
    }
  }

  function toggleExpandCard(id: string) {
    setDefects((prev) =>
      prev.map((item) => (item.id === id ? { ...item, expanded: !item.expanded } : item))
    );
  }

  function playVoiceNote(audioUri: string | null) {
    if (!audioUri) return;
    try {
      audioPlayer.replace({ uri: audioUri });
      audioPlayer.play();
    } catch (error) {
      Alert.alert('Playback Error', 'Could not play voice recording.');
    }
  }

  function getSeverityColor(severity?: string) {
    switch (severity) {
      case 'Critical':
        return '#EF4444';
      case 'High':
        return '#F97316';
      case 'Medium':
        return '#EAB308';
      default:
        return '#22C55E';
    }
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />

      <View style={styles.overlayContainer} pointerEvents="box-none">
        <View style={styles.topHud}>
          <TouchableOpacity style={styles.exitButton} onPress={() => router.back()}>
            <Text style={styles.exitButtonText}>✕ End Walk</Text>
          </TouchableOpacity>

          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {isRecording ? '🔴 RECORDING VOICE...' : `📋 ${defects.length} PUNCH ITEMS`}
            </Text>
          </View>
        </View>

        {currentPhotoUri && (
          <View style={styles.stagedBanner}>
            <Image source={{ uri: currentPhotoUri }} style={styles.stagedThumb} />
            <View style={styles.stagedTextContainer}>
              <Text style={styles.stagedTitle}>Photo Captured</Text>
              <Text style={styles.stagedSubtitle}>
                {isRecording ? 'Speak room, defect & severity...' : 'Tap Record Voice to describe the issue'}
              </Text>
            </View>
            {!isRecording && (
              <TouchableOpacity onPress={() => setCurrentPhotoUri(null)}>
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.bottomSection}>
          {defects.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsScroll}>
              {defects.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.punchCard, item.expanded && styles.punchCardExpanded]}
                  onPress={() => toggleExpandCard(item.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardHeaderTop}>
                    <Image source={{ uri: item.photoUri }} style={styles.cardImage} />
                    <View style={styles.cardContent}>
                      {item.status === 'analyzing' && (
                        <View style={styles.analyzingRow}>
                          <ActivityIndicator size="small" color="#38BDF8" />
                          <Text style={styles.analyzingText}>AI analyzing...</Text>
                        </View>
                      )}

                      {item.status === 'ready' && item.aiData && (
                        <>
                          <View style={styles.cardHeaderRow}>
                            <Text style={styles.locationTag}>{item.aiData.location}</Text>
                            <View
                              style={[
                                styles.severityBadge,
                                { backgroundColor: getSeverityColor(item.aiData.severity) },
                              ]}
                            >
                              <Text style={styles.severityText}>{item.aiData.severity}</Text>
                            </View>
                          </View>
                          <Text style={styles.defectTitle} numberOfLines={item.expanded ? undefined : 1}>
                            {item.aiData.defectTitle}
                          </Text>
                        </>
                      )}

                      {item.status === 'error' && (
                        <Text style={styles.errorText} numberOfLines={3}>
                          ⚠️ {item.errorMessage}
                        </Text>
                      )}
                    </View>
                  </View>

                  {item.status === 'ready' && item.aiData && (
                    <View style={styles.expandedSection}>
                      <Text style={styles.defectDesc} numberOfLines={item.expanded ? undefined : 2}>
                        {item.aiData.description}
                      </Text>
                      <Text style={styles.actionText} numberOfLines={item.expanded ? undefined : 1}>
                        🛠 {item.aiData.recommendedAction}
                      </Text>
                      
                      <View style={styles.cardFooterRow}>
                        <Text style={styles.expandHint}>
                          {item.expanded ? '▲ Tap to collapse' : '▼ Tap to expand'}
                        </Text>
                        <TouchableOpacity 
                          style={styles.playAudioButton}
                          onPress={() => playVoiceNote(item.audioUri)}
                        >
                          <Text style={styles.playAudioText}>▶ Replay Audio</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.snapButton, currentPhotoUri ? styles.snapButtonDimmed : null]}
              onPress={takePhoto}
              disabled={isRecording}
            >
              <View style={styles.snapInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.voiceButton,
                !currentPhotoUri && styles.voiceButtonDisabled,
                isRecording && styles.voiceButtonRecording,
              ]}
              onPress={isRecording ? stopRecordingAndAnalyze : startRecording}
            >
              <Text style={styles.voiceButtonText}>
                {isRecording ? '⏹ Stop & Analyze AI' : '🎙 Record Voice'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1, width: '100%', height: '100%' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#0F172A' },
  permissionText: { color: '#94A3B8', fontSize: 16 },
  permissionTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  permissionSubtitle: { color: '#94A3B8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  grantButton: { backgroundColor: '#2563EB', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  grantButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  overlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topHud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 52, paddingHorizontal: 20 },
  exitButton: { backgroundColor: '#0F172ACC', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  exitButtonText: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  statusBadge: { backgroundColor: '#0F172AD9', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  statusBadgeText: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },
  stagedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172AE6', marginHorizontal: 20, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#38BDF8' },
  stagedThumb: { width: 54, height: 54, borderRadius: 8, marginRight: 12 },
  stagedTextContainer: { flex: 1 },
  stagedTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, marginBottom: 2 },
  stagedSubtitle: { color: '#94A3B8', fontSize: 12 },
  retakeText: { color: '#F87171', fontWeight: '700', fontSize: 13, paddingLeft: 8 },
  bottomSection: { backgroundColor: '#0F172AD9', paddingTop: 14, paddingBottom: 36, paddingHorizontal: 16 },
  cardsScroll: { marginBottom: 14 },
  punchCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 10, marginRight: 12, width: 280, borderWidth: 1, borderColor: '#334155' },
  punchCardExpanded: { width: 310 },
  cardHeaderTop: { flexDirection: 'row' },
  cardImage: { width: 58, height: 58, borderRadius: 8, marginRight: 10 },
  cardContent: { flex: 1, justifyContent: 'center' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center' },
  analyzingText: { color: '#38BDF8', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  locationTag: { color: '#38BDF8', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  severityBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  severityText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  defectTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  expandedSection: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 6 },
  defectDesc: { color: '#94A3B8', fontSize: 11, lineHeight: 15, marginBottom: 4 },
  actionText: { color: '#E2E8F0', fontSize: 10, fontWeight: '600', marginBottom: 6 },
  cardFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expandHint: { color: '#64748B', fontSize: 10, fontStyle: 'italic' },
  playAudioButton: { backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  playAudioText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  errorText: { color: '#F87171', fontSize: 11 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  snapButton: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  snapButtonDimmed: { opacity: 0.5 },
  snapInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  voiceButton: { backgroundColor: '#2563EB', paddingVertical: 18, paddingHorizontal: 24, borderRadius: 32 },
  voiceButtonDisabled: { backgroundColor: '#334155', opacity: 0.6 },
  voiceButtonRecording: { backgroundColor: '#EF4444' },
  voiceButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});