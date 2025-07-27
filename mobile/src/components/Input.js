import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error,
  disabled = false,
  multiline = false,
  numberOfLines = 1,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const getInputStyle = () => {
    const baseStyle = [styles.input];
    
    if (isFocused) {
      baseStyle.push(styles.inputFocused);
    }
    
    if (error) {
      baseStyle.push(styles.inputError);
    }
    
    if (disabled) {
      baseStyle.push(styles.inputDisabled);
    }
    
    if (multiline) {
      baseStyle.push(styles.inputMultiline);
    }
    
    if (style) {
      baseStyle.push(style);
    }
    
    return baseStyle;
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          style={getInputStyle()}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry={secureTextEntry}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        
        {error && (
          <Ionicons 
            name="alert-circle" 
            size={16} 
            color={theme.colors.error} 
            style={styles.errorIcon}
          />
        )}
      </View>
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    backgroundColor: theme.colors.background,
    color: theme.colors.textPrimary,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputDisabled: {
    backgroundColor: theme.colors.backgroundTertiary,
    color: theme.colors.textTertiary,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 100,
  },
  errorIcon: {
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
});

export default Input; 