import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useInspectionStore } from '../store/inspectionStore';

export default function HomeScreen() {
  const router = useRouter();
  const { propertyName, defects } = useInspectionStore();

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>GEMINI 3.8 MULTIMODAL READY</Text>
      </View>

      <Text style={styles.title}>WalkPunch AI</Text>
      <Text style={styles.subtitle}>
        Snap photos and speak naturally during your walkthrough. AI parses every defect into structured punch items automatically.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>ACTIVE INSPECTION</Text>
        <Text style={styles.propertyTitle}>{propertyName}</Text>
        <Text style={styles.countText}>
          {defects.length} {defects.length === 1 ? 'Defect' : 'Defects'} Logged in Session
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/walkthrough')}
      >
        <Text style={styles.primaryButtonText}>
          {defects.length > 0 ? '📷 Resume Inspection Walk' : '+ Start New Inspection Walk'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push('/review')}
      >
        <Text style={styles.secondaryButtonText}>
          📋 Review & Edit Punch List ({defects.length})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    padding: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  statusCard: {
    backgroundColor: '#1E293B',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  statusLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  propertyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  countText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
});