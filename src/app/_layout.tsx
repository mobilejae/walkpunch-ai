import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0F172A' },
          headerTintColor: '#F8FAFC',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ title: 'WalkPunch AI' }} 
        />
      </Stack>
    </>
  );
}