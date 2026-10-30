import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

/**
 * O AVISO NO CELULAR PELA APPLE.
 *
 * O aviso de hoje do Guia é o do navegador (web push, com as chaves VAPID),
 * e ele não chega dentro de app. Aqui o app pede a permissão e devolve ao
 * site o endereço do aparelho no serviço de avisos do Expo, que entrega pela
 * Apple; o site guarda esse endereço e o servidor manda por lá, com as mesmas
 * regras de horário e de preferência dos avisos de hoje.
 *
 * O app NÃO pede a permissão sozinho ao abrir: quem pede é o site, no mesmo
 * lugar em que hoje pergunta se a pessoa quer os avisos.
 */

Notifications.setNotificationHandler({
  // Com o app aberto o aviso também aparece, como no web push de hoje.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class SemPermissao extends Error {
  name = "NotAllowedError";
}

export async function pedirAvisos(): Promise<{ token: string; plataforma: string }> {
  if (!Device.isDevice) throw new Error("O aviso só funciona num aparelho de verdade.");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("padrao", {
      name: "Avisos do Guia",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") throw new SemPermissao("A pessoa não deixou o app mandar avisos.");

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return { token: data, plataforma: Platform.OS };
}

/**
 * O ENDEREÇO QUE O TOQUE NO AVISO ABRE. O servidor manda em `data.link` o
 * mesmo caminho que o aviso do navegador abre hoje (`/spott?ola=1`, por
 * exemplo), com o mesmo nome do campo do web push (`public/sw.js` do Guia).
 */
export function enderecoDoAviso(resposta: Notifications.NotificationResponse | null): string | null {
  const url = resposta?.notification.request.content.data?.link;
  return typeof url === "string" && url.length > 0 ? url : null;
}
