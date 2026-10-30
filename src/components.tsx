import { Pressable, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { styles, colors } from './theme';
export type Tab = 'Timer' | 'History' | 'Settings';
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Icon({ kind, color }: { kind: Tab; color: string }) {
  return (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
    >
      {kind === 'Timer' ? (
        <>
          <Circle cx={12} cy={13} r={8} />
          <Path d="M9 2h6M12 9v5l3 2" />
        </>
      ) : kind === 'History' ? (
        <>
          <Path d="M3 5v5h5M4 9a9 9 0 1 1-1 7M12 7v6l4 2" />
        </>
      ) : (
        <>
          <Path d="M4 6h16M4 12h16M4 18h16" />
          <Circle cx={8} cy={6} r={2} fill={colors.bg} />
          <Circle cx={16} cy={12} r={2} fill={colors.bg} />
          <Circle cx={10} cy={18} r={2} fill={colors.bg} />
        </>
      )}
    </Svg>
  );
}
