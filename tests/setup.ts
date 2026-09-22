/// <reference types="jest" />
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { isRecognitionAvailable: () => false, requestPermissionsAsync: async () => ({ granted: false }), start: jest.fn(), stop: jest.fn() },
  useSpeechRecognitionEvent: jest.fn(),
}));
