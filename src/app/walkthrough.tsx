import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CapturedDefect {
  id: string;
  photoUri: string;
  audioUri: string | null;
  timestamp: string;
}

export default function WalkthroughScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micGranted, setMicGranted] = useState<boolean | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
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

  async function stopRecordingAndSaveItem() {
    if (!isRecording || !currentPhotoUri) return;
    setIsRecording(false);
    try {
      await audioRecorder.stop();
      const audioUri = audioRecorder.uri;

      const newDefect: CapturedDefect = {
        id: Date.now().toString(),
        photoUri: currentPhotoUri,
        audioUri: audioUri,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setDefects((prev) => [newDefect, ...prev]);
      setCurrentPhotoUri(null);
    } catch (error) {
      Alert.alert('Save Error', 'Failed to save audio recording.');
    }
  }

  function playVoiceNote(audioUri: string | null) {
    if (!audioUri) {
      Alert.alert('No Audio', 'No voice note found for this item.');
      return;
    }
    try {
      audioPlayer.replace({ uri: audioUri });
      audioPlayer.play();
    } catch (error) {
      Alert.alert('Playback Error', 'Could not play voice recording.');
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
              {isRecording ? '🔴 RECORDING VOICE...' : `📋 ${defects.length} ITEMS LOGGED`}
            </Text>
          </View>
        </View>

        {currentPhotoUri && (
          <View style={styles.stagedBanner}>
            <Image source={{ uri: currentPhotoUri }} style={styles.stagedThumb} />
            <View style={styles.stagedTextContainer}>
              <Text style={styles.stagedTitle}>Photo Captured</Text>
              <Text style={styles.stagedSubtitle}>
                {isRecording ? 'Speak defect details now...' : 'Tap Record Voice to describe the issue'}
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
            <View>
              <Text style={styles.stripHint}>Tap a thumbnail below to replay voice note:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripScroll}>
                {defects.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.stripItem}
                    onPress={() => playVoiceNote(item.audioUri)}
                  >
                    <Image source={{ uri: item.photoUri }} style={styles.stripImage} />
                    <Text style={styles.stripLabel}>▶ #{defects.length - idx}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
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
              onPress={isRecording ? stopRecordingAndSaveItem : startRecording}
            >
              <Text style={styles.voiceButtonText}>
                {isRecording ? '⏹ Stop & Save Item' : '🎙 Record Voice'}
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
  bottomSection: { backgroundColor: '#0F172AD1', paddingTop: 14, paddingBottom: 36, paddingHorizontal: 20 },
  stripHint: { color: '#94A3B8', fontSize: 11, marginBottom: 6, fontWeight: '600' },
  stripScroll: { marginBottom: 14 },
  stripItem: { marginRight: 12, alignItems: 'center' },
  stripImage: { width: 52, height: 52, borderRadius: 8, borderWidth: 1.5, borderColor: '#38BDF8' },
  stripLabel: { color: '#38BDF8', fontSize: 11, marginTop: 4, fontWeight: '700' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  snapButton: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  snapButtonDimmed: { opacity: 0.5 },
  snapInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  voiceButton: { backgroundColor: '#2563EB', paddingVertical: 18, paddingHorizontal: 24, borderRadius: 32 },
  voiceButtonDisabled: { backgroundColor: '#334155', opacity: 0.6 },
  voiceButtonRecording: { backgroundColor: '#EF4444' },
  voiceButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});