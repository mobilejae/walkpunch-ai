import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useInspectionStore } from '../store/inspectionStore';

export default function HomeScreen() {
  const router = useRouter();
  const { propertyName, inspectorName, defects, isHydrated, clearAll } = useInspectionStore();

  const criticalCount = defects.filter((d) => d.aiData?.severity === 'Critical').length;
  const highCount = defects.filter((d) => d.aiData?.severity === 'High').length;
  const mediumCount = defects.filter((d) => d.aiData?.severity === 'Medium').length;
  const lowCount = defects.filter((d) => d.aiData?.severity === 'Low').length;

  function confirmStartFresh() {
    Alert.alert(
      'Start Fresh Inspection?',
      'This will clear all currently logged punch items from device storage.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear & Reset', style: 'destructive', onPress: () => clearAll() },
      ]
    );
  }

  if (!isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Loading saved inspection...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>ON-DEVICE AUTO-SAVE ACTIVE</Text>
      </View>

      <Text style={styles.title}>WalkPunch AI</Text>
      <Text style={styles.subtitle}>
        Snap photos and speak naturally during your walkthrough. Every punch item is automatically saved to device storage.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>ACTIVE INSPECTION</Text>
        <Text style={styles.propertyTitle}>{propertyName}</Text>
        <Text style={styles.inspectorText}>Inspector: {inspectorName}</Text>
        <Text style={styles.countText}>
          {defects.length} {defects.length === 1 ? 'Defect' : 'Defects'} Saved on Device
        </Text>

        {defects.length > 0 && (
          <View style={styles.pillsRow}>
            <View style={[styles.sevPill, { borderColor: '#EF4444' }]}>
              <Text style={[styles.sevPillText, { color: '#EF4444' }]}>
                Crit: {criticalCount}
              </Text>
            </View>
            <View style={[styles.sevPill, { borderColor: '#F97316' }]}>
              <Text style={[styles.sevPillText, { color: '#F97316' }]}>
                High: {highCount}
              </Text>
            </View>
            <View style={[styles.sevPill, { borderColor: '#EAB308' }]}>
              <Text style={[styles.sevPillText, { color: '#EAB308' }]}>
                Med: {mediumCount}
              </Text>
            </View>
            <View style={[styles.sevPill, { borderColor: '#22C55E' }]}>
              <Text style={[styles.sevPillText, { color: '#22C55E' }]}>
                Low: {lowCount}
              </Text>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/walkthrough')}
      >
        <Text style={styles.primaryButtonText}>
          {defects.length > 0 ? '📷 Resume Inspection Walk' : '+ Start Inspection Walk'}
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

      {defects.length > 0 && (
        <TouchableOpacity style={styles.resetButton} onPress={confirmStartFresh}>
          <Text style={styles.resetButtonText}>🗑 Clear & Start Fresh Inspection</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 12,
  },
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
    marginBottom: 24,
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
    marginBottom: 2,
  },
  inspectorText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  countText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  pillsRow: {
    flexDirection: 'row',
    marginTop: 12,
    justifyContent: 'space-between',
  },
  sevPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    marginHorizontal: 3,
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  sevPillText: {
    fontSize: 11,
    fontWeight: '800',
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
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  resetButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
  },
});