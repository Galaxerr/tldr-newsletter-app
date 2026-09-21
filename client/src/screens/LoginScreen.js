import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getGoogleModule } from '../services/auth';
import { styles } from '../theme/css/AuthScreenStyles';

// Use Google's branded native button; unsupported builds still display an actionable error.
function SignInButton({ onPress }) {
  let Button;
  try { Button = getGoogleModule().GoogleSignInButton; } catch { /* Show setup guidance when tapped. */ }
  if (Button) return <Button size="standard" colorScheme="light" signInBehavior="none" onPress={onPress} style={styles.googleButton} />;
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>Sign in with Google</Text></TouchableOpacity>;
}

export function LoginScreen() {
  const { signIn, signOut, logoutPending, error } = useAuth();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your newsletters, all in one place.</Text>
        <Text style={styles.text}>Choose the Google account that receives your TLDR newsletters.</Text>
        <Text style={styles.text}>Google will ask for permission to read Gmail. This permission covers the emails in your inbox; the app uses it to find and import TLDR newsletters. It does not send, delete, or modify emails.</Text>
        <Text style={styles.text}>Summaries, bookmarks, and reading status stay on your device, separate for each account, and are available offline after your first sign-in.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {logoutPending && <TouchableOpacity accessibilityRole="button" onPress={signOut} style={styles.button}><Text style={styles.buttonText}>Retry sign-out</Text></TouchableOpacity>}
        <SignInButton onPress={signIn} />
      </ScrollView>
    </SafeAreaView>
  );
}
